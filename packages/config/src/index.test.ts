import { describe, expect, it } from "vitest";
import { loadServerEnvironment } from "./index.js";

describe("loadServerEnvironment", () => {
  it("parses required configuration and applies safe defaults", () => {
    expect(
      loadServerEnvironment({ DATABASE_URL: "postgresql://example" }),
    ).toMatchObject({
      NODE_ENV: "development",
      API_PORT: 5050,
    });
  });

  it("fails fast when the database URL is absent", () => {
    expect(() => loadServerEnvironment({})).toThrow();
  });

  it("rejects development authentication secrets in production", () => {
    expect(() =>
      loadServerEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://example",
      }),
    ).toThrow(/Production requires/);
  });

  it("accepts Stripe live keys without weakening test-key validation", () => {
    expect(
      loadServerEnvironment({
        DATABASE_URL: "postgresql://example",
        STRIPE_SECRET_KEY: "sk_live_example",
      }).STRIPE_SECRET_KEY,
    ).toBe("sk_live_example");
  });
});
