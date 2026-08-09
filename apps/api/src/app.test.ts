import request from "supertest";
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
