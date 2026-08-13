import request from "supertest";
import express from "express";
import { describe, expect, it } from "vitest";
import { createLogger } from "@slabx/observability";
import { createApp } from "./app.js";

const clock = () => new Date("2026-01-01T00:00:00.000Z");
const logger = createLogger("slabx-api-test", "silent");

describe("health endpoints", () => {
  it("reports liveness without checking external dependencies", async () => {
    const app = createApp({
      databaseHealthCheck: async () => undefined,
      logger,
      webOrigin: "http://localhost:5173",
      clock,
    });
    const response = await request(app).get("/api/v1/health/live").expect(200);
    expect(response.body).toMatchObject({ status: "ok", service: "slabx-api" });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("reports readiness when PostgreSQL is available", async () => {
    const app = createApp({
      databaseHealthCheck: async () => undefined,
      logger,
      webOrigin: "http://localhost:5173",
      clock,
    });
    const response = await request(app).get("/api/v1/health/ready").expect(200);
    expect(response.body).toMatchObject({ checks: { database: "up" } });
  });

  it("returns 503 when PostgreSQL is unavailable", async () => {
    const app = createApp({
      databaseHealthCheck: async () => Promise.reject(new Error("offline")),
      logger,
      webOrigin: "http://localhost:5173",
      clock,
    });
    const response = await request(app).get("/api/v1/health/ready").expect(503);
    expect(response.body).toMatchObject({ status: "degraded" });
  });
});

describe("Stripe webhook transport", () => {
  it("preserves the unmodified request body for signature verification", async () => {
    let received: Buffer | null = null;
    const app = createApp({
      databaseHealthCheck: async () => undefined,
      logger,
      webOrigin: "http://localhost:5173",
      stripeWebhookHandlers: [
        express.raw({ type: "application/json" }),
        (req, res) => {
          received = req.body as Buffer;
          res.status(200).end();
        },
      ],
    });
    const payload = '{"id":"evt_test","type":"checkout.session.completed"}';
    await request(app)
      .post("/api/v1/payments/stripe/webhook")
      .set("content-type", "application/json")
      .send(payload)
      .expect(200);
    expect(Buffer.isBuffer(received)).toBe(true);
    expect(received).toEqual(Buffer.from(payload));
  });
});

describe("launch hardening", () => {
  it("sets security and request correlation headers", async () => {
    const app = createApp({
      databaseHealthCheck: async () => undefined,
      logger,
      webOrigin: "http://localhost:5173",
    });
    const response = await request(app).get("/api/v1/openapi.json").expect(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("returns a stable error envelope when the API limit is exceeded", async () => {
    const app = createApp({
      databaseHealthCheck: async () => undefined,
      logger,
      webOrigin: "http://localhost:5173",
      rateLimitMax: 1,
      rateLimitWindowMs: 60_000,
    });
    await request(app).get("/api/v1/openapi.json").expect(200);
    const response = await request(app).get("/api/v1/openapi.json").expect(429);
    expect(response.body).toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
    expect(response.headers["ratelimit"]).toBeTruthy();
  });
});
