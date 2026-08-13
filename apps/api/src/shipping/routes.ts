import cookieParser from "cookie-parser";
import { createHmac, timingSafeEqual } from "node:crypto";
import express from "express";
import { Router, type RequestHandler, type Response } from "express";
import {
  shippingLabelPurchaseSchema,
  shippingRateRequestSchema,
} from "@slabx/contracts";
import { CatalogError } from "../catalog/service.js";
import { IdentityService } from "../identity/service.js";
import { ShippingService } from "./service.js";

export function createEasyPostWebhookHandler(
  service: ShippingService,
  secret: string,
): RequestHandler[] {
  return [
    express.raw({ type: "application/json", limit: "1mb" }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body) || !validEasyPostSignature(req, secret))
        return fail(res, 401, "INVALID_WEBHOOK", "Invalid EasyPost webhook.");
      try {
        await service.webhook(JSON.parse(req.body.toString("utf8")));
        res.json({ received: true });
      } catch {
        return fail(
          res,
          400,
          "INVALID_WEBHOOK",
          "EasyPost webhook processing failed.",
        );
      }
    },
  ];
}

function validEasyPostSignature(
  req: Parameters<RequestHandler>[0],
  secret: string,
) {
  const timestamp = req.get("x-timestamp");
  const path = req.get("x-path");
  const supplied = req
    .get("x-hmac-signature-v2")
    ?.replace(/^hmac-sha256-hex=/i, "");
  if (!timestamp || !path || !supplied || !Buffer.isBuffer(req.body))
    return false;
  const age = Math.abs(Date.now() - Date.parse(timestamp));
  if (!Number.isFinite(age) || age > 60_000) return false;
  const expected = createHmac("sha256", secret)
    .update(timestamp)
    .update(req.method.toUpperCase())
    .update(path)
    .update(req.body)
    .digest("hex");
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(supplied, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createShippingRouter(options: {
  service: ShippingService;
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
  router.post("/shipping/rates", auth, csrf, async (req, res) => {
    const input = shippingRateRequestSchema.safeParse(req.body);
    if (!input.success)
      return fail(
        res,
        422,
        "VALIDATION_ERROR",
        input.error.issues[0]?.message ?? "Invalid parcel.",
      );
    try {
      res.json({
        data: await options.service.rates(
          res.locals.user.id,
          input.data.orderId,
          input.data.parcel,
        ),
      });
    } catch (error) {
      handle(error, res);
    }
  });
  router.post(
    "/orders/:orderId/shipping-label",
    auth,
    csrf,
    async (req, res) => {
      const input = shippingLabelPurchaseSchema.safeParse(req.body);
      if (!input.success)
        return fail(
          res,
          422,
          "VALIDATION_ERROR",
          input.error.issues[0]?.message ?? "Invalid label.",
        );
      try {
        res.status(201).json({
          data: await options.service.buy(
            res.locals.user.id,
            String(req.params.orderId),
            input.data,
          ),
        });
      } catch (error) {
        handle(error, res);
      }
    },
  );
  router.get("/orders/:orderId/shipment", auth, async (req, res) => {
    const shipment = await options.service.shipment(
      res.locals.user.id,
      String(req.params.orderId),
    );
    if (!shipment) return fail(res, 404, "NOT_FOUND", "Shipment not found.");
    res.json({ data: shipment });
  });
  router.get("/shipments/:shipmentId/label", auth, (_req, res) => {
    res
      .type("html")
      .send(
        "<!doctype html><title>SlabX test label</title><main style='font:20px system-ui;padding:40px;border:4px solid #111'><h1>SLABX TEST SHIPPING LABEL</h1><p>Not valid for postage. EasyPost will replace this preview.</p></main>",
      );
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
