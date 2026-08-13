import { z } from "zod";

const serverEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().max(65535).default(5050),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  API_ORIGIN: z.url().default("http://localhost:5050"),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z
    .string()
    .min(32)
    .default("development-only-session-secret-change-me"),
  PASSWORD_PEPPER: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z
    .url()
    .default("http://localhost:5050/api/v1/auth/google/callback"),
  EMAIL_PROVIDER_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).default("SlabX <no-reply@example.test>"),
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_test_").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  EASYPOST_API_KEY: z.string().startsWith("EZTK").optional(),
  EASYPOST_WEBHOOK_SECRET: z.string().min(24).optional(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function loadServerEnvironment(
  source: Record<string, string | undefined>,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(source);
}
