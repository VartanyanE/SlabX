import cookieParser from "cookie-parser";
import { Router, type RequestHandler, type Response } from "express";
import type { ZodType } from "zod";
import {
  listingInputSchema,
  listingQuerySchema,
  listingUpdateSchema,
} from "@slabx/contracts";
import { CatalogError } from "../catalog/service.js";
import { IdentityService } from "../identity/service.js";
import { ListingService } from "./service.js";

const SESSION_COOKIE = "slabx_session";
export function createListingRouter(options: {
  service: ListingService;
  identity: IdentityService;
}): Router {
  const router = Router();
  router.use(cookieParser());
  const auth: RequestHandler = async (req, res, next) => {
    const session = await options.identity.authenticate(
      req.cookies[SESSION_COOKIE],
    );
    if (!session)
      return fail(res, 401, "AUTHENTICATION_REQUIRED", "Please sign in.");
    res.locals.session = session;
    res.locals.user = session.user;
    next();
  };
  const csrf: RequestHandler = (req, res, next) => {
    if (
      !options.identity.validateCsrf(
        req.get("x-csrf-token"),
        res.locals.session.csrfTokenHash,
      )
    )
      return fail(res, 403, "CSRF_INVALID", "Refresh the page and try again.");
    next();
  };
  router.get("/listings", async (req, res) => {
    try {
      const session = await options.identity.authenticate(
        req.cookies[SESSION_COOKIE],
      );
      const result = await options.service.search(
        parse(listingQuerySchema, req.query),
        session?.user.id,
      );
      res.json({
        data: result.data,
        meta: { requestId: req.id, nextCursor: result.nextCursor },
      });
    } catch (error) {
      handle(error, res);
    }
  });
  router.get("/listings/:listingId", async (req, res) => {
    const session = await options.identity.authenticate(
      req.cookies[SESSION_COOKIE],
    );
    const listing = await options.service.get(
      String(req.params.listingId),
      session?.user.id,
    );
    if (!listing) return fail(res, 404, "NOT_FOUND", "Listing not found.");
    res.json({ data: listing, meta: { requestId: req.id } });
  });
  router.post("/listings", auth, csrf, async (req, res) => {
    try {
      const listing = await options.service.create(
        res.locals.user.id,
        res.locals.user.emailVerified,
        parse(listingInputSchema, req.body),
      );
      res.status(201).json({ data: listing, meta: { requestId: req.id } });
    } catch (error) {
      handle(error, res);
    }
  });
  router.patch("/listings/:listingId", auth, csrf, async (req, res) => {
    try {
      const listing = await options.service.update(
        res.locals.user.id,
        String(req.params.listingId),
        parse(listingUpdateSchema, req.body),
      );
      res.json({ data: listing, meta: { requestId: req.id } });
    } catch (error) {
      handle(error, res);
    }
  });
  for (const [action, method] of [
    ["publish", "publish"],
    ["pause", "pause"],
    ["resume", "publish"],
  ] as const) {
    router.post(
      `/listings/:listingId/${action}`,
      auth,
      csrf,
      async (req, res) => {
        try {
          await options.service[method](
            res.locals.user.id,
            String(req.params.listingId),
          );
          res.status(204).end();
        } catch (error) {
          handle(error, res);
        }
      },
    );
  }
  router.delete("/listings/:listingId", auth, csrf, async (req, res) => {
    try {
      await options.service.close(
        res.locals.user.id,
        String(req.params.listingId),
      );
      res.status(204).end();
    } catch (error) {
      handle(error, res);
    }
  });
  router.get("/me/listings", auth, async (_req, res) =>
    res.json({ data: await options.service.mine(res.locals.user.id) }),
  );
  router.get("/me/watchlist", auth, async (_req, res) =>
    res.json({ data: await options.service.watchlist(res.locals.user.id) }),
  );
  router.put("/me/watchlist/:listingId", auth, csrf, async (req, res) => {
    try {
      await options.service.watch(
        res.locals.user.id,
        String(req.params.listingId),
      );
      res.status(204).end();
    } catch (error) {
      handle(error, res);
    }
  });
  router.delete("/me/watchlist/:listingId", auth, csrf, async (req, res) => {
    await options.service.unwatch(
      res.locals.user.id,
      String(req.params.listingId),
    );
    res.status(204).end();
  });
  return router;
}
function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new CatalogError(
      "VALIDATION_ERROR",
      422,
      result.error.issues[0]?.message ?? "Invalid request.",
    );
  return result.data;
}
function handle(value: unknown, response: Response) {
  if (value instanceof CatalogError)
    return fail(response, value.status, value.code, value.message);
  throw value;
}
function fail(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  return response.status(status).json({
    error: { code, message, requestId: String(response.req.id ?? "") },
  });
}
