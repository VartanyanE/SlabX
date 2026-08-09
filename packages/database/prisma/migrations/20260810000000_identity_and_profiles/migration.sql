CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "EmailTokenType" AS ENUM ('VERIFICATION', 'PASSWORD_RESET', 'EMAIL_CHANGE');
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE');
CREATE TYPE "SellerStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'ACTIVE', 'RESTRICTED');

CREATE TABLE "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "email_normalized" TEXT NOT NULL UNIQUE,
  "email_display" TEXT NOT NULL, "email_verified_at" TIMESTAMPTZ(6),
  "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION', "last_login_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deleted_at" TIMESTAMPTZ(6)
);
CREATE INDEX "users_status_created_at_idx" ON "users"("status", "created_at");

CREATE TABLE "password_credentials" (
  "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "password_hash" TEXT NOT NULL, "password_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "failed_attempts" INTEGER NOT NULL DEFAULT 0, "locked_until" TIMESTAMPTZ(6)
);
CREATE TABLE "auth_identities" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" "AuthProvider" NOT NULL, "provider_subject" TEXT NOT NULL, "provider_email" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("provider", "provider_subject")
);
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities"("user_id");
CREATE TABLE "sessions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" TEXT NOT NULL UNIQUE, "csrf_token_hash" TEXT NOT NULL, "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revoked_at" TIMESTAMPTZ(6),
  "ip_hash" TEXT, "user_agent_hash" TEXT, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE TABLE "email_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" "EmailTokenType" NOT NULL, "token_hash" TEXT NOT NULL UNIQUE, "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "email_tokens_user_id_type_consumed_at_idx" ON "email_tokens"("user_id", "type", "consumed_at");
CREATE TABLE "profiles" (
  "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "handle_normalized" TEXT NOT NULL UNIQUE, "handle_display" TEXT NOT NULL, "display_name" TEXT NOT NULL,
  "bio" TEXT, "seller_status" "SellerStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "rating_average" DECIMAL(3,2), "rating_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "addresses" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "label" TEXT NOT NULL, "recipient_name" TEXT NOT NULL, "line1" TEXT NOT NULL, "line2" TEXT,
  "city" TEXT NOT NULL, "region" TEXT NOT NULL, "postal_code" TEXT NOT NULL, "country_code" CHAR(2) NOT NULL,
  "is_default_shipping" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6)
);
CREATE INDEX "addresses_user_id_deleted_at_idx" ON "addresses"("user_id", "deleted_at");
CREATE UNIQUE INDEX "addresses_one_default_shipping_per_user" ON "addresses"("user_id") WHERE "is_default_shipping" AND "deleted_at" IS NULL;

CREATE TABLE "roles" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL);
CREATE TABLE "permissions" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL);
CREATE TABLE "role_permissions" (
  "role_id" UUID NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "permission_id" UUID NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE, PRIMARY KEY("role_id", "permission_id")
);
CREATE TABLE "user_roles" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role_id" UUID NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY("user_id", "role_id")
);
CREATE TABLE "audit_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "actor_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "action" TEXT NOT NULL, "target_type" TEXT, "target_id" TEXT, "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"("actor_user_id", "created_at");
CREATE INDEX "audit_events_action_created_at_idx" ON "audit_events"("action", "created_at");

INSERT INTO "roles" ("code", "name") VALUES
  ('USER', 'User'), ('SUPPORT', 'Support'), ('TRUST_SAFETY', 'Trust & Safety'), ('FINANCE', 'Finance'), ('ADMIN', 'Administrator');
