import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import * as argon2 from "argon2";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function safeEqualHash(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function hashPassword(
  password: string,
  pepper: string,
): Promise<string> {
  return argon2.hash(`${password}${pepper}`, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string,
  password: string,
  pepper: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, `${password}${pepper}`);
  } catch {
    return false;
  }
}
