CREATE TYPE "OfferThreadStatus" AS ENUM ('OPEN','ACCEPTED','DECLINED','CANCELLED','EXPIRED');
CREATE TYPE "OfferRevisionKind" AS ENUM ('OFFER','COUNTER');

ALTER TABLE "listings" ADD COLUMN "reserved_by_user_id" UUID, ADD COLUMN "reserved_until" TIMESTAMPTZ(6), ADD COLUMN "reservation_reason" TEXT;

CREATE TABLE "offer_threads" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "listing_id" UUID NOT NULL, "buyer_user_id" UUID NOT NULL, "seller_user_id" UUID NOT NULL,
  "status" "OfferThreadStatus" NOT NULL DEFAULT 'OPEN', "current_revision_id" UUID, "accepted_price_minor" BIGINT,
  "checkout_expires_at" TIMESTAMPTZ(6), "version" INTEGER NOT NULL DEFAULT 1, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "offer_threads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "offer_threads_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE,
  CONSTRAINT "offer_threads_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "offer_threads_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "offer_threads_one_open_per_buyer" ON "offer_threads"("listing_id","buyer_user_id") WHERE "status"='OPEN';
CREATE INDEX "offer_threads_buyer_status_idx" ON "offer_threads"("buyer_user_id","status","updated_at" DESC);
CREATE INDEX "offer_threads_seller_status_idx" ON "offer_threads"("seller_user_id","status","updated_at" DESC);
CREATE INDEX "offer_threads_listing_status_idx" ON "offer_threads"("listing_id","status");

CREATE TABLE "offer_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "thread_id" UUID NOT NULL, "actor_user_id" UUID NOT NULL, "kind" "OfferRevisionKind" NOT NULL,
  "amount_minor" BIGINT NOT NULL, "message" TEXT, "idempotency_key" UUID NOT NULL, "expires_at" TIMESTAMPTZ(6) NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offer_revisions_pkey" PRIMARY KEY ("id"), CONSTRAINT "offer_revisions_amount_check" CHECK ("amount_minor" > 0),
  CONSTRAINT "offer_revisions_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "offer_threads"("id") ON DELETE CASCADE,
  CONSTRAINT "offer_revisions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
ALTER TABLE "offer_threads" ADD CONSTRAINT "offer_threads_current_revision_id_fkey" FOREIGN KEY ("current_revision_id") REFERENCES "offer_revisions"("id") ON DELETE SET NULL;
CREATE INDEX "offer_revisions_thread_created_idx" ON "offer_revisions"("thread_id","created_at");
CREATE UNIQUE INDEX "offer_revisions_idempotency_key_key" ON "offer_revisions"("idempotency_key");
CREATE INDEX "offer_revisions_expires_at_idx" ON "offer_revisions"("expires_at");

CREATE TABLE "notifications" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL, "type" TEXT NOT NULL, "payload" JSONB NOT NULL, "read_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"), CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE);
CREATE INDEX "notifications_user_read_created_idx" ON "notifications"("user_id","read_at","created_at" DESC);
CREATE TABLE "outbox_events" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "topic" TEXT NOT NULL, "aggregate_id" TEXT NOT NULL, "payload" JSONB NOT NULL, "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processed_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"));
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events"("processed_at","available_at");
