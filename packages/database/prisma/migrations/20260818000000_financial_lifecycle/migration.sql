CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED','APPROVED','REJECTED','PROCESSING','SUCCEEDED','FAILED');
CREATE TYPE "DisputeStatus" AS ENUM ('WARNING_NEEDS_RESPONSE','WARNING_UNDER_REVIEW','NEEDS_RESPONSE','UNDER_REVIEW','WON','LOST');
CREATE TYPE "TransferStatus" AS ENUM ('PENDING','PROCESSING','SUCCEEDED','REVERSED','FAILED');
CREATE TYPE "PayoutHoldStatus" AS ENUM ('ACTIVE','RELEASED','CONSUMED');

CREATE TABLE "refund_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "order_id" UUID NOT NULL, "requester_user_id" UUID NOT NULL,
  "amount_minor" BIGINT NOT NULL CHECK ("amount_minor">0), "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "reason_code" TEXT NOT NULL, "details" TEXT, "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "provider_refund_id" TEXT UNIQUE, "idempotency_key" UUID NOT NULL UNIQUE, "failure_message" TEXT,
  "resolved_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "refund_requests_order_id_created_at_idx" ON "refund_requests"("order_id","created_at");
CREATE INDEX "refund_requests_status_created_at_idx" ON "refund_requests"("status","created_at");

CREATE TABLE "disputes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "order_id" UUID NOT NULL, "provider_dispute_id" TEXT NOT NULL UNIQUE,
  "provider_charge_id" TEXT NOT NULL, "amount_minor" BIGINT NOT NULL CHECK ("amount_minor">0), "currency" CHAR(3) NOT NULL,
  "reason" TEXT NOT NULL, "status" "DisputeStatus" NOT NULL, "evidence_due_at" TIMESTAMPTZ(6), "closed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT
);
CREATE INDEX "disputes_status_evidence_due_at_idx" ON "disputes"("status","evidence_due_at");
CREATE INDEX "disputes_order_id_idx" ON "disputes"("order_id");

CREATE TABLE "seller_transfers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "order_id" UUID NOT NULL, "provider_transfer_id" TEXT UNIQUE,
  "amount_minor" BIGINT NOT NULL CHECK ("amount_minor">0), "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "status" "TransferStatus" NOT NULL DEFAULT 'PENDING', "idempotency_key" UUID NOT NULL UNIQUE, "failure_message" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT
);
CREATE INDEX "seller_transfers_order_id_created_at_idx" ON "seller_transfers"("order_id","created_at");
CREATE INDEX "seller_transfers_status_created_at_idx" ON "seller_transfers"("status","created_at");

CREATE TABLE "payout_holds" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "order_id" UUID NOT NULL, "seller_user_id" UUID NOT NULL,
  "amount_minor" BIGINT NOT NULL CHECK ("amount_minor">0), "currency" CHAR(3) NOT NULL DEFAULT 'USD', "reason_code" TEXT NOT NULL,
  "status" "PayoutHoldStatus" NOT NULL DEFAULT 'ACTIVE', "release_at" TIMESTAMPTZ(6), "released_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "payout_holds_seller_user_id_status_release_at_idx" ON "payout_holds"("seller_user_id","status","release_at");
CREATE INDEX "payout_holds_order_id_idx" ON "payout_holds"("order_id");

CREATE TABLE "reconciliation_records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "order_id" UUID, "provider" TEXT NOT NULL, "provider_type" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL, "amount_minor" BIGINT NOT NULL, "currency" CHAR(3) NOT NULL, "expected_minor" BIGINT NOT NULL,
  "difference_minor" BIGINT NOT NULL, "reconciled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "metadata" JSONB NOT NULL DEFAULT '{}',
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT,
  UNIQUE ("provider","provider_type","provider_id")
);
CREATE INDEX "reconciliation_records_difference_minor_reconciled_at_idx" ON "reconciliation_records"("difference_minor","reconciled_at");
