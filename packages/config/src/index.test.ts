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
});
