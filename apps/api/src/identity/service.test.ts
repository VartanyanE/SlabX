import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, hashToken } from "./crypto.js";
import { IdentityError, IdentityService } from "./service.js";
import type { EmailDelivery, IdentityRepository } from "./types.js";

const now = new Date("2026-08-09T12:00:00.000Z");
let repository: IdentityRepository;
let email: EmailDelivery;
let service: IdentityService;

beforeEach(() => {
  repository = {
    findCredential: vi.fn(),
    recordLoginFailure: vi.fn(),
    recordLoginSuccess: vi.fn(),
    createSession: vi.fn(),
    consumeEmailToken: vi.fn(),
    updatePasswordAndRevokeSessions: vi.fn(),
  } as unknown as IdentityRepository;
  email = {
    sendVerification: vi.fn(),
    sendPasswordReset: vi.fn(),
  };
  service = new IdentityService({
    repository,
    email,
    secret: "test-secret-that-is-long-enough-to-use",
    passwordPepper: "pepper",
    clock: () => now,
  });
});

describe("IdentityService", () => {
  it("returns the same generic error for an unknown account", async () => {
    vi.mocked(repository.findCredential).mockResolvedValue(null);
    await expect(
      service.login({ email: "nobody@example.com", password: "wrong" }, {}),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
  });

  it("locks a password account after five failed attempts", async () => {
    vi.mocked(repository.findCredential).mockResolvedValue({
      userId: "user-1",
      passwordHash: await hashPassword("correct-password", "pepper"),
      status: "ACTIVE",
      emailVerified: true,
      failedAttempts: 4,
      lockedUntil: null,
    });
    await expect(
      service.login(
        { email: "collector@example.com", password: "wrong-password" },
        {},
      ),
    ).rejects.toBeInstanceOf(IdentityError);
    expect(repository.recordLoginFailure).toHaveBeenCalledWith(
      "user-1",
      new Date("2026-08-09T12:15:00.000Z"),
    );
  });

  it("rejects expired or already-consumed reset tokens", async () => {
    vi.mocked(repository.consumeEmailToken).mockResolvedValue(null);
    await expect(
      service.resetPassword(
        "expired-token-that-is-at-least-32-bytes",
        "new-password-long-enough",
      ),
    ).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    expect(repository.updatePasswordAndRevokeSessions).not.toHaveBeenCalled();
  });

  it("uses a secret-bound CSRF token comparison", () => {
    const token = "csrf-token";
    const expected = hashToken(token, "test-secret-that-is-long-enough-to-use");
    expect(service.validateCsrf(token, expected)).toBe(true);
    expect(service.validateCsrf("tampered", expected)).toBe(false);
    expect(service.validateCsrf(undefined, expected)).toBe(false);
  });

  it("refuses Google identities without a verified email", async () => {
    await expect(
      service.loginWithGoogle(
        {
          subject: "google-subject",
          email: "collector@example.com",
          emailVerified: false,
          displayName: "Collector",
        },
        {},
      ),
    ).rejects.toMatchObject({ code: "GOOGLE_EMAIL_UNVERIFIED" });
  });
});
