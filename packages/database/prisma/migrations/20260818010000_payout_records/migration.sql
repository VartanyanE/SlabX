CREATE TYPE "PayoutStatus" AS ENUM ('PENDING','IN_TRANSIT','PAID','FAILED','CANCELED');
CREATE TABLE "payout_records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "connected_account_id" UUID NOT NULL,
  "provider_payout_id" TEXT NOT NULL UNIQUE, "amount_minor" BIGINT NOT NULL, "currency" CHAR(3) NOT NULL,
  "status" "PayoutStatus" NOT NULL, "arrival_at" TIMESTAMPTZ(6), "failure_code" TEXT, "failure_message" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("connected_account_id") REFERENCES "connected_accounts"("id") ON DELETE RESTRICT
);
CREATE INDEX "payout_records_connected_account_id_created_at_idx" ON "payout_records"("connected_account_id","created_at" DESC);
CREATE INDEX "payout_records_status_arrival_at_idx" ON "payout_records"("status","arrival_at");
