import cookieParser from "cookie-parser";
import { Router, type RequestHandler, type Response } from "express";
import {
  moderationActionSchema,
  reportInputSchema,
  reviewInputSchema,
} from "@slabx/contracts";
import { CatalogError } from "../catalog/service.js";
import { IdentityService } from "../identity/service.js";
import { TrustService } from "./service.js";

export function createTrustRouter(options: {
  service: TrustService;
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
  const moderator: RequestHandler = (_req, res, next) => {
    if (
      !res.locals.user.roles.some((role: string) =>
        ["MODERATOR", "ADMIN"].includes(role),
      )
    )
      return fail(
        res,
        403,
        "MODERATOR_REQUIRED",
        "Moderator access is required.",
      );
    next();
  };

  router.get("/profiles/:userId/trust", async (req, res) =>
    res.json({
      data: await options.service.profile(String(req.params.userId)),
    }),
  );
  router.post("/reviews", auth, csrf, async (req, res) => {
    const input = reviewInputSchema.safeParse(req.body);
    if (!input.success)
      return fail(
        res,
        422,
        "VALIDATION_ERROR",
        input.error.issues[0]?.message ?? "Invalid review.",
      );
    try {
      res.status(201).json({
        data: await options.service.review(res.locals.user.id, input.data),
      });
    } catch (error) {
      handle(error, res);
    }
  });
  router.post("/reports", auth, csrf, async (req, res) => {
    const input = reportInputSchema.safeParse(req.body);
    if (!input.success)
      return fail(
        res,
        422,
        "VALIDATION_ERROR",
        input.error.issues[0]?.message ?? "Invalid report.",
      );
    res.status(201).json({
      data: await options.service.report(res.locals.user.id, input.data),
    });
  });
  router.get("/moderation/reports", auth, moderator, async (req, res) =>
    res.json({
      data: await options.service.queue(
        typeof req.query.status === "string" ? req.query.status : undefined,
      ),
    }),
  );
  router.post(
    "/moderation/reports/:reportId/actions",
    auth,
    csrf,
    moderator,
    async (req, res) => {
      const input = moderationActionSchema.safeParse(req.body);
      if (!input.success)
        return fail(
          res,
          422,
          "VALIDATION_ERROR",
          input.error.issues[0]?.message ?? "Invalid action.",
        );
      try {
        await options.service.moderate(
          res.locals.user.id,
          String(req.params.reportId),
          input.data,
        );
        res.status(204).end();
      } catch (error) {
        handle(error, res);
      }
    },
  );
  return router;
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
