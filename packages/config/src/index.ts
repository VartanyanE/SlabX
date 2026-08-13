import { z } from "zod";

const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_PORT: z.coerce.number().int().positive().max(65535).default(5050),
    API_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60_000),
    API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    API_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
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
    STRIPE_SECRET_KEY: z
      .string()
      .refine(
        (value) => value.startsWith("sk_test_") || value.startsWith("sk_live_"),
        {
          message: "Stripe secret key must be a test or live secret key",
        },
      )
      .optional(),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
    EASYPOST_API_KEY: z.string().startsWith("EZTK").optional(),
    EASYPOST_WEBHOOK_SECRET: z.string().min(24).optional(),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== "production") return;
    if (
      environment.SESSION_SECRET === "development-only-session-secret-change-me"
    )
      context.addIssue({
        code: "custom",
        path: ["SESSION_SECRET"],
        message: "Production requires a unique session secret",
      });
    if (environment.PASSWORD_PEPPER.length < 16)
      context.addIssue({
        code: "custom",
        path: ["PASSWORD_PEPPER"],
        message: "Production requires a separately managed password pepper",
      });
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function loadServerEnvironment(
  source: Record<string, string | undefined>,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(source);
}
