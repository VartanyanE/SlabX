CREATE TYPE "ConnectedAccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'RESTRICTED');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'PAYMENT_FAILED', 'CANCELLED');
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TABLE "connected_accounts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE RESTRICT,
  "provider_account_id" TEXT NOT NULL UNIQUE, "status" "ConnectedAccountStatus" NOT NULL DEFAULT 'PENDING',
  "details_submitted" BOOLEAN NOT NULL DEFAULT false, "charges_enabled" BOOLEAN NOT NULL DEFAULT false,
  "payouts_enabled" BOOLEAN NOT NULL DEFAULT false, "requirements_currently_due" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "orders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "order_number" TEXT NOT NULL UNIQUE,
  "buyer_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "seller_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "listing_id" UUID NOT NULL REFERENCES "listings"("id") ON DELETE RESTRICT,
  "offer_thread_id" UUID REFERENCES "offer_threads"("id") ON DELETE RESTRICT,
  "connected_account_id" UUID NOT NULL REFERENCES "connected_accounts"("id") ON DELETE RESTRICT,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT', "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "subtotal_minor" BIGINT NOT NULL, "platform_fee_minor" BIGINT NOT NULL, "seller_proceeds_minor" BIGINT NOT NULL,
  "shipping_address_snapshot" JSONB, "paid_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "orders_amounts_check" CHECK (subtotal_minor > 0 AND platform_fee_minor >= 0 AND seller_proceeds_minor = subtotal_minor - platform_fee_minor),
  CONSTRAINT "orders_distinct_parties_check" CHECK (buyer_user_id <> seller_user_id)
);
CREATE INDEX "orders_buyer_user_id_created_at_idx" ON "orders"("buyer_user_id", "created_at" DESC);
CREATE INDEX "orders_seller_user_id_created_at_idx" ON "orders"("seller_user_id", "created_at" DESC);
CREATE INDEX "orders_listing_id_status_idx" ON "orders"("listing_id", "status");
CREATE UNIQUE INDEX "orders_one_open_listing_idx" ON "orders"("listing_id") WHERE status IN ('PENDING_PAYMENT', 'PAID');

CREATE TABLE "order_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "order_id" UUID NOT NULL UNIQUE REFERENCES "orders"("id") ON DELETE RESTRICT,
  "listing_snapshot" JSONB NOT NULL, "collection_item_snapshot" JSONB NOT NULL, "catalog_card_snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "payment_attempts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "order_id" UUID NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
  "buyer_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT, "idempotency_key" UUID NOT NULL UNIQUE,
  "provider_checkout_id" TEXT UNIQUE, "provider_payment_intent_id" TEXT UNIQUE,
  "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED', "failure_code" TEXT, "failure_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "payment_attempts_order_id_created_at_idx" ON "payment_attempts"("order_id", "created_at" DESC);
CREATE TABLE "ledger_entries" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "order_id" UUID NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
  "account_code" TEXT NOT NULL, "amount_minor" BIGINT NOT NULL, "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "description" TEXT NOT NULL, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ledger_entries_order_id_created_at_idx" ON "ledger_entries"("order_id", "created_at");
CREATE TABLE "webhook_inbox" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "provider" TEXT NOT NULL, "provider_event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL, "payload" JSONB NOT NULL, "processed_at" TIMESTAMPTZ, "error_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("provider", "provider_event_id")
);
CREATE INDEX "webhook_inbox_processed_at_created_at_idx" ON "webhook_inbox"("processed_at", "created_at");
