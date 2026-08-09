import type {
  AddressInput,
  AuthenticatedUser,
  ProfileUpdate,
} from "@slabx/contracts";

export type CredentialRecord = {
  userId: string;
  passwordHash: string;
  status: AuthenticatedUser["status"];
  emailVerified: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
};

export type SessionRecord = {
  user: AuthenticatedUser;
  csrfTokenHash: string;
  expiresAt: Date;
};
export type AddressRecord = AddressInput & { id: string };
export type SessionSummary = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  current: boolean;
};

export interface IdentityRepository {
  createPasswordUser(input: {
    email: string;
    emailNormalized: string;
    passwordHash: string;
    handle: string;
    handleNormalized: string;
    displayName: string;
    verificationHash: string;
    verificationExpiresAt: Date;
  }): Promise<string>;
  findCredential(emailNormalized: string): Promise<CredentialRecord | null>;
  recordLoginFailure(userId: string, lockedUntil: Date | null): Promise<void>;
  recordLoginSuccess(userId: string): Promise<void>;
  consumeEmailToken(
    tokenHash: string,
    type: "VERIFICATION" | "PASSWORD_RESET",
    now: Date,
  ): Promise<string | null>;
  createEmailToken(
    userId: string,
    type: "VERIFICATION" | "PASSWORD_RESET",
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  updatePasswordAndRevokeSessions(
    userId: string,
    passwordHash: string,
    now: Date,
  ): Promise<void>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    csrfTokenHash: string;
    expiresAt: Date;
    ipHash?: string;
    userAgentHash?: string;
  }): Promise<void>;
  findSession(tokenHash: string, now: Date): Promise<SessionRecord | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
  revokeAllSessions(userId: string, now: Date): Promise<void>;
  listSessions(
    userId: string,
    currentTokenHash: string,
  ): Promise<SessionSummary[]>;
  findUserByEmail(emailNormalized: string): Promise<{ id: string } | null>;
  findOrCreateGoogleUser(input: {
    subject: string;
    email: string;
    emailNormalized: string;
    displayName: string;
  }): Promise<string>;
  getUser(userId: string): Promise<AuthenticatedUser | null>;
  updateProfile(
    userId: string,
    input: ProfileUpdate,
  ): Promise<AuthenticatedUser>;
  listAddresses(userId: string): Promise<AddressRecord[]>;
  createAddress(userId: string, input: AddressInput): Promise<AddressRecord>;
  updateAddress(
    userId: string,
    addressId: string,
    input: AddressInput,
  ): Promise<AddressRecord | null>;
  deleteAddress(userId: string, addressId: string): Promise<boolean>;
}

export interface EmailDelivery {
  sendVerification(email: string, token: string): Promise<void>;
  sendPasswordReset(email: string, token: string): Promise<void>;
}
