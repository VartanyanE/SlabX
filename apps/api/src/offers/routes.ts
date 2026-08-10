import cookieParser from "cookie-parser";
import { Router, type RequestHandler, type Response } from "express";
import type { ZodType } from "zod";
import {
  offerActionSchema,
  offerCounterSchema,
  offerCreateSchema,
} from "@slabx/contracts";
import { CatalogError } from "../catalog/service.js";
import { IdentityService } from "../identity/service.js";
import { OfferService } from "./service.js";

export function createOfferRouter(options: {
  service: OfferService;
  identity: IdentityService;
}): Router {
  const router = Router();
  router.use(cookieParser());
  const auth: RequestHandler = async (req, res, next) => {
    const session = await options.identity.authenticate(
      req.cookies.slabx_session,
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
  router.get("/me/offers", auth, async (_req, res) =>
    res.json({ data: await options.service.list(res.locals.user.id) }),
  );
  router.get("/offers/:threadId", auth, async (req, res) => {
    const data = await options.service.get(
      res.locals.user.id,
      String(req.params.threadId),
    );
    if (!data) return fail(res, 404, "NOT_FOUND", "Offer not found.");
    res.json({ data });
  });
  router.post("/listings/:listingId/offers", auth, csrf, async (req, res) => {
    try {
      const data = await options.service.create(
        res.locals.user.id,
        String(req.params.listingId),
        parse(offerCreateSchema, req.body),
      );
      res.status(201).json({ data });
    } catch (e) {
      handle(e, res);
    }
  });
  router.post("/offers/:threadId/counter", auth, csrf, async (req, res) => {
    try {
      const data = await options.service.counter(
        res.locals.user.id,
        String(req.params.threadId),
        parse(offerCounterSchema, req.body),
      );
      res.status(201).json({ data });
    } catch (e) {
      handle(e, res);
    }
  });
  for (const [path, action] of [
    ["accept", "ACCEPTED"],
    ["decline", "DECLINED"],
    ["cancel", "CANCELLED"],
  ] as const)
    router.post(`/offers/:threadId/${path}`, auth, csrf, async (req, res) => {
      try {
        await options.service.act(
          res.locals.user.id,
          String(req.params.threadId),
          parse(offerActionSchema, req.body),
          action,
        );
        res.status(204).end();
      } catch (e) {
        handle(e, res);
      }
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
  return response
    .status(status)
    .json({
      error: { code, message, requestId: String(response.req.id ?? "") },
    });
}
