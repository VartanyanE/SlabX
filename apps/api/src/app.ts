import { randomUUID } from "node:crypto";
import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
  type Router,
} from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";
import { healthStatusSchema } from "@slabx/contracts";
import type { DatabaseHealthCheck } from "@slabx/database";
import { openApiDocument } from "./openapi/document.js";

type AppDependencies = {
  databaseHealthCheck: DatabaseHealthCheck;
  logger: Logger;
  version?: string;
  webOrigin: string;
  clock?: () => Date;
  identityRouter?: Router;
  catalogRouter?: Router;
  listingRouter?: Router;
  offerRouter?: Router;
  paymentRouter?: Router;
  shippingRouter?: Router;
  trustRouter?: Router;
  financialRouter?: Router;
  stripeWebhookHandlers?: RequestHandler[];
  easyPostWebhookHandlers?: RequestHandler[];
  rateLimitWindowMs?: number;
  rateLimitMax?: number;
  trustProxy?: boolean;
};

export function createApp({
  databaseHealthCheck,
  logger,
  version = "0.1.0",
  webOrigin,
  clock = () => new Date(),
  identityRouter,
  catalogRouter,
  listingRouter,
  offerRouter,
  paymentRouter,
  shippingRouter,
  trustRouter,
  financialRouter,
  stripeWebhookHandlers,
  easyPostWebhookHandlers,
  rateLimitWindowMs = 60_000,
  rateLimitMax = 120,
  trustProxy = false,
}: AppDependencies): Express {
  const app = express();
  app.disable("x-powered-by");
  if (trustProxy) app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: webOrigin, credentials: true }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (request, response) => {
        const requestId =
          request.headers["x-request-id"]?.toString() ?? randomUUID();
        response.setHeader("x-request-id", requestId);
        return requestId;
      },
    }),
  );
  if (stripeWebhookHandlers)
    app.post("/api/v1/payments/stripe/webhook", ...stripeWebhookHandlers);
  if (easyPostWebhookHandlers)
    app.post("/api/v1/shipping/easypost/webhook", ...easyPostWebhookHandlers);
  app.use(
    "/api/v1",
    rateLimit({
      windowMs: rateLimitWindowMs,
      limit: rateLimitMax,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skip: (request) => request.path.startsWith("/health/"),
      handler: (request, response) => {
        response.status(429).json({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please wait and try again.",
            requestId: request.id,
          },
        });
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  const live: RequestHandler = (_request, response) => {
    response.json(
      healthStatusSchema.parse({
        status: "ok",
        service: "slabx-api",
        version,
        timestamp: clock().toISOString(),
      }),
    );
  };

  app.get("/health/live", live);
  app.get("/api/v1/health/live", live);
  app.get("/api/v1/health/ready", async (_request, response) => {
    try {
      await databaseHealthCheck();
      response.json(
        healthStatusSchema.parse({
          status: "ok",
          service: "slabx-api",
          version,
          timestamp: clock().toISOString(),
          checks: { database: "up" },
        }),
      );
    } catch {
      response.status(503).json({
        status: "degraded",
        service: "slabx-api",
        version,
        timestamp: clock().toISOString(),
        checks: { database: "down" },
      });
    }
  });
  app.get("/api/v1/openapi.json", (_request, response) =>
    response.json(openApiDocument),
  );
  if (identityRouter) app.use("/api/v1", identityRouter);
  if (catalogRouter) app.use("/api/v1", catalogRouter);
  if (listingRouter) app.use("/api/v1", listingRouter);
  if (offerRouter) app.use("/api/v1", offerRouter);
  if (paymentRouter) app.use("/api/v1", paymentRouter);
  if (shippingRouter) app.use("/api/v1", shippingRouter);
  if (trustRouter) app.use("/api/v1", trustRouter);
  if (financialRouter) app.use("/api/v1", financialRouter);

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
        requestId: response.getHeader("x-request-id"),
      },
    });
  });

  const errorHandler: ErrorRequestHandler = (
    error,
    request,
    response,
    _next,
  ) => {
    void _next;
    request.log.error({ err: error }, "Unhandled request error");
    response.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        requestId: request.id,
      },
    });
  };
  app.use(errorHandler);
  return app;
}
