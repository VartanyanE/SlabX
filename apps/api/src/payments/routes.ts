import cookieParser from "cookie-parser";
import express, { Router, type RequestHandler, type Response } from "express";
import { checkoutCreateSchema } from "@slabx/contracts";
import { CatalogError } from "../catalog/service.js";
import { IdentityService } from "../identity/service.js";
import { PaymentService } from "./service.js";

export function createStripeWebhookHandler(
  service: PaymentService,
): RequestHandler[] {
  return [
    express.raw({ type: "application/json", limit: "1mb" }),
    async (req, res) => {
      const signature = req.get("stripe-signature");
      if (!signature || !Buffer.isBuffer(req.body))
        return fail(res, 400, "INVALID_WEBHOOK", "Invalid Stripe webhook.");
      try {
        await service.webhook(req.body, signature);
        res.json({ received: true });
      } catch {
        return fail(
          res,
          400,
          "INVALID_WEBHOOK",
          "Stripe webhook verification or processing failed.",
        );
      }
    },
  ];
}

export function createPaymentRouter(options: {
  service: PaymentService;
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
  router.get("/seller/payment-account", auth, async (_req, res) =>
    res.json({ data: await options.service.account(res.locals.user.id) }),
  );
  router.post(
    "/seller/payment-account/onboarding",
    auth,
    csrf,
    async (_req, res) =>
      res.status(201).json({
        data: await options.service.onboarding(
          res.locals.user.id,
          res.locals.user.email,
        ),
      }),
  );
  router.post(
    "/seller/payment-account/refresh",
    auth,
    csrf,
    async (_req, res) =>
      res.json({
        data: await options.service.refreshAccount(res.locals.user.id),
      }),
  );
  router.post("/checkout", auth, csrf, async (req, res) => {
    const parsed = checkoutCreateSchema.safeParse(req.body);
    if (!parsed.success)
      return fail(
        res,
        422,
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid checkout.",
      );
    try {
      res.status(201).json({
        data: await options.service.checkout(res.locals.user.id, parsed.data),
      });
    } catch (error) {
      handle(error, res);
    }
  });
  router.get("/me/orders", auth, async (_req, res) =>
    res.json({ data: await options.service.orders(res.locals.user.id) }),
  );
  router.get("/orders/:orderId", auth, async (req, res) => {
    const order = await options.service.order(
      res.locals.user.id,
      String(req.params.orderId),
    );
    if (!order) return fail(res, 404, "NOT_FOUND", "Order not found.");
    res.json({ data: order });
  });
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
