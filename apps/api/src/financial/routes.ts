import cookieParser from "cookie-parser";
import { Router, type RequestHandler, type Response } from "express";
import { refundDecisionSchema, refundRequestSchema } from "@slabx/contracts";
import { CatalogError } from "../catalog/service.js";
import { IdentityService } from "../identity/service.js";
import { FinancialService } from "./service.js";

export function createFinancialRouter(options: {
  service: FinancialService;
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
  const staff: RequestHandler = (_req, res, next) => {
    if (
      !res.locals.user.roles.some((role: string) =>
        ["MODERATOR", "ADMIN"].includes(role),
      )
    )
      return fail(res, 403, "STAFF_REQUIRED", "Staff access is required.");
    next();
  };
  router.post("/refunds", auth, csrf, async (req, res) => {
    const input = refundRequestSchema.safeParse(req.body);
    if (!input.success)
      return fail(
        res,
        422,
        "VALIDATION_ERROR",
        input.error.issues[0]?.message ?? "Invalid refund.",
      );
    try {
      res.status(201).json({
        data: await options.service.request(res.locals.user.id, input.data),
      });
    } catch (error) {
      handle(error, res);
    }
  });
  router.get("/refunds", auth, async (_req, res) =>
    res.json({
      data: await options.service.list(
        res.locals.user.id,
        res.locals.user.roles.some((role: string) =>
          ["MODERATOR", "ADMIN"].includes(role),
        ),
      ),
    }),
  );
  router.get("/financial/refunds", auth, staff, async (_req, res) =>
    res.json({ data: await options.service.list(res.locals.user.id, true) }),
  );
  router.get("/financial/overview", auth, staff, async (_req, res) =>
    res.json({ data: await options.service.overview() }),
  );
  router.get("/seller/financial-summary", auth, async (_req, res) =>
    res.json({ data: await options.service.sellerSummary(res.locals.user.id) }),
  );
  router.post(
    "/refunds/:refundId/decision",
    auth,
    csrf,
    staff,
    async (req, res) => {
      const input = refundDecisionSchema.safeParse(req.body);
      if (!input.success)
        return fail(
          res,
          422,
          "VALIDATION_ERROR",
          input.error.issues[0]?.message ?? "Invalid decision.",
        );
      try {
        if (input.data.decision === "APPROVE")
          await options.service.approve(
            res.locals.user.id,
            String(req.params.refundId),
          );
        else
          await options.service.reject(
            res.locals.user.id,
            String(req.params.refundId),
            input.data.note,
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
