import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createIdentityRouter } from "./routes.js";
import type { GoogleOidc } from "./google.js";
import type { IdentityService } from "./service.js";

describe("Google callback", () => {
  it("uses the configured public HTTPS origin behind a proxy", async () => {
    const callback = vi.fn().mockResolvedValue({
      subject: "google-subject",
      email: "collector@example.com",
      emailVerified: true,
      displayName: "Collector",
      returnTo: "/account",
    });
    const loginWithGoogle = vi.fn().mockResolvedValue({
      sessionToken: "session-token",
      csrfToken: "csrf-token",
      userId: "user-id",
    });
    const app = express();
    app.use(
      "/api/v1",
      createIdentityRouter({
        service: { loginWithGoogle } as unknown as IdentityService,
        google: { callback } as unknown as GoogleOidc,
        secureCookies: true,
        webOrigin: "https://slabx-staging-web.onrender.com",
      }),
    );

    await request(app)
      .get("/api/v1/auth/google/callback?code=code&state=state")
      .set("Host", "slabx-staging-web.onrender.com")
      .set("X-Forwarded-Proto", "http")
      .set("Cookie", "slabx_google_flow=sealed-flow")
      .expect(302)
      .expect("Location", "https://slabx-staging-web.onrender.com/account");

    expect(callback).toHaveBeenCalledWith(
      new URL(
        "https://slabx-staging-web.onrender.com/api/v1/auth/google/callback?code=code&state=state",
      ),
      "sealed-flow",
    );
  });
});
