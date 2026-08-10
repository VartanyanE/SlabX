import type {
  AddressInput,
  LoginRequest,
  ProfileUpdate,
  RegisterRequest,
} from "@slabx/contracts";
import {
  hashPassword,
  hashToken,
  normalizeEmail,
  normalizeHandle,
  randomToken,
  safeEqualHash,
  verifyPassword,
} from "./crypto.js";
import type { EmailDelivery, IdentityRepository } from "./types.js";

export class IdentityError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type IdentityServiceOptions = {
  repository: IdentityRepository;
  email: EmailDelivery;
  secret: string;
  passwordPepper: string;
  clock?: () => Date;
};

export class IdentityService {
  private readonly clock: () => Date;
  constructor(private readonly options: IdentityServiceOptions) {
    this.clock = options.clock ?? (() => new Date());
  }

  async register(input: RegisterRequest): Promise<{ userId: string }> {
    const emailNormalized = normalizeEmail(input.email);
    const passwordHash = await hashPassword(
      input.password,
      this.options.passwordPepper,
    );
    const token = randomToken();
    try {
      const userId = await this.options.repository.createPasswordUser({
        email: input.email.trim(),
        emailNormalized,
        passwordHash,
        handle: input.handle.trim(),
        handleNormalized: normalizeHandle(input.handle),
        displayName: input.displayName,
        verificationHash: hashToken(token, this.options.secret),
        verificationExpiresAt: this.afterHours(24),
      });
      await this.options.email.sendVerification(input.email.trim(), token);
      return { userId };
    } catch (error) {
      if (isUniqueViolation(error))
        throw new IdentityError(
          "ACCOUNT_CONFLICT",
          409,
          "That email or handle is unavailable.",
        );
      throw error;
    }
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.options.repository.consumeEmailToken(
      hashToken(token, this.options.secret),
      "VERIFICATION",
      this.clock(),
    );
    if (!userId)
      throw new IdentityError(
        "TOKEN_INVALID",
        400,
        "This verification link is invalid or expired.",
      );
  }

  async login(
    input: LoginRequest,
    context: { ip?: string; userAgent?: string },
  ): Promise<{ sessionToken: string; csrfToken: string; userId: string }> {
    const credential = await this.options.repository.findCredential(
      normalizeEmail(input.email),
    );
    const now = this.clock();
    if (
      !credential ||
      credential.status === "CLOSED" ||
      credential.status === "SUSPENDED"
    )
      throw invalidCredentials();
    if (!credential.emailVerified)
      throw new IdentityError(
        "EMAIL_NOT_VERIFIED",
        403,
        "Verify your email before signing in.",
      );
    if (credential.lockedUntil && credential.lockedUntil > now)
      throw new IdentityError(
        "ACCOUNT_TEMPORARILY_LOCKED",
        429,
        "Try again later.",
      );
    if (
      !(await verifyPassword(
        credential.passwordHash,
        input.password,
        this.options.passwordPepper,
      ))
    ) {
      const failed = credential.failedAttempts + 1;
      await this.options.repository.recordLoginFailure(
        credential.userId,
        failed >= 5 ? new Date(now.getTime() + 15 * 60_000) : null,
      );
      throw invalidCredentials();
    }
    await this.options.repository.recordLoginSuccess(credential.userId);
    return this.createSession(credential.userId, context);
  }

  async loginWithGoogle(
    input: {
      subject: string;
      email: string;
      emailVerified: boolean;
      displayName: string;
    },
    context: { ip?: string; userAgent?: string },
  ) {
    if (!input.emailVerified)
      throw new IdentityError(
        "GOOGLE_EMAIL_UNVERIFIED",
        401,
        "Google did not provide a verified email.",
      );
    const userId = await this.options.repository.findOrCreateGoogleUser({
      subject: input.subject,
      email: input.email,
      emailNormalized: normalizeEmail(input.email),
      displayName: input.displayName,
    });
    return this.createSession(userId, context);
  }

  private async createSession(
    userId: string,
    context: { ip?: string; userAgent?: string },
  ) {
    const now = this.clock();
    const sessionToken = randomToken();
    const csrfToken = randomToken();
    await this.options.repository.createSession({
      userId,
      tokenHash: hashToken(sessionToken, this.options.secret),
      csrfTokenHash: hashToken(csrfToken, this.options.secret),
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
      ...(context.ip
        ? { ipHash: hashToken(context.ip, this.options.secret) }
        : {}),
      ...(context.userAgent
        ? { userAgentHash: hashToken(context.userAgent, this.options.secret) }
        : {}),
    });
    return { sessionToken, csrfToken, userId };
  }

  async authenticate(sessionToken: string | undefined) {
    if (!sessionToken) return null;
    return this.options.repository.findSession(
      hashToken(sessionToken, this.options.secret),
      this.clock(),
    );
  }
  async logout(sessionToken: string | undefined): Promise<void> {
    if (sessionToken)
      await this.options.repository.revokeSession(
        hashToken(sessionToken, this.options.secret),
        this.clock(),
      );
  }
  async logoutAll(userId: string): Promise<void> {
    await this.options.repository.revokeAllSessions(userId, this.clock());
  }
  listSessions(userId: string, sessionToken: string) {
    return this.options.repository.listSessions(
      userId,
      hashToken(sessionToken, this.options.secret),
    );
  }
  validateCsrf(token: string | undefined, expectedHash: string): boolean {
    return Boolean(
      token &&
      safeEqualHash(hashToken(token, this.options.secret), expectedHash),
    );
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.options.repository.findUserByEmail(
      normalizeEmail(email),
    );
    if (!user) return;
    const token = randomToken();
    await this.options.repository.createEmailToken(
      user.id,
      "PASSWORD_RESET",
      hashToken(token, this.options.secret),
      this.afterHours(1),
    );
    await this.options.email.sendPasswordReset(email.trim(), token);
  }
  async resetPassword(token: string, password: string): Promise<void> {
    const userId = await this.options.repository.consumeEmailToken(
      hashToken(token, this.options.secret),
      "PASSWORD_RESET",
      this.clock(),
    );
    if (!userId)
      throw new IdentityError(
        "TOKEN_INVALID",
        400,
        "This password reset link is invalid or expired.",
      );
    await this.options.repository.updatePasswordAndRevokeSessions(
      userId,
      await hashPassword(password, this.options.passwordPepper),
      this.clock(),
    );
  }
  getUser(userId: string) {
    return this.options.repository.getUser(userId);
  }
  updateProfile(userId: string, input: ProfileUpdate) {
    return this.options.repository.updateProfile(userId, input);
  }
  listAddresses(userId: string) {
    return this.options.repository.listAddresses(userId);
  }
  createAddress(userId: string, input: AddressInput) {
    return this.options.repository.createAddress(userId, input);
  }
  updateAddress(userId: string, addressId: string, input: AddressInput) {
    return this.options.repository.updateAddress(userId, addressId, input);
  }
  deleteAddress(userId: string, addressId: string) {
    return this.options.repository.deleteAddress(userId, addressId);
  }
  private afterHours(hours: number): Date {
    return new Date(this.clock().getTime() + hours * 60 * 60_000);
  }
}

function invalidCredentials() {
  return new IdentityError(
    "INVALID_CREDENTIALS",
    401,
    "Email or password is incorrect.",
  );
}
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
