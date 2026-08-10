CREATE TYPE "ListingStatus" AS ENUM ('DRAFT','ACTIVE','PAUSED','RESERVED','CLOSED');

CREATE TABLE "listings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "seller_user_id" UUID NOT NULL, "collection_item_id" UUID NOT NULL,
  "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT', "price_minor" BIGINT NOT NULL, "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "accepts_offers" BOOLEAN NOT NULL DEFAULT false, "minimum_offer_minor" BIGINT, "condition_disclosure" TEXT NOT NULL,
  "published_at" TIMESTAMPTZ(6), "version" INTEGER NOT NULL DEFAULT 1, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deleted_at" TIMESTAMPTZ(6), CONSTRAINT "listings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listings_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "listings_collection_item_id_fkey" FOREIGN KEY ("collection_item_id") REFERENCES "collection_items"("id") ON DELETE RESTRICT,
  CONSTRAINT "listings_price_check" CHECK ("price_minor" > 0),
  CONSTRAINT "listings_offer_check" CHECK ("minimum_offer_minor" IS NULL OR ("minimum_offer_minor" > 0 AND "minimum_offer_minor" <= "price_minor"))
);
CREATE UNIQUE INDEX "listings_one_open_per_item" ON "listings"("collection_item_id") WHERE "status" IN ('DRAFT','ACTIVE','PAUSED','RESERVED') AND "deleted_at" IS NULL;
CREATE INDEX "listings_status_published_at_idx" ON "listings"("status","published_at" DESC);
CREATE INDEX "listings_seller_user_id_status_idx" ON "listings"("seller_user_id","status");
CREATE INDEX "listings_price_minor_idx" ON "listings"("price_minor");
CREATE INDEX "listings_collection_item_id_idx" ON "listings"("collection_item_id");

CREATE TABLE "listing_price_history" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "listing_id" UUID NOT NULL, "price_minor" BIGINT NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "listing_price_history_pkey" PRIMARY KEY ("id"), CONSTRAINT "listing_price_history_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE);
CREATE INDEX "listing_price_history_listing_id_created_at_idx" ON "listing_price_history"("listing_id","created_at" DESC);

CREATE TABLE "watchlist_entries" ("user_id" UUID NOT NULL, "listing_id" UUID NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "watchlist_entries_pkey" PRIMARY KEY ("user_id","listing_id"), CONSTRAINT "watchlist_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE, CONSTRAINT "watchlist_entries_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE);
CREATE INDEX "watchlist_entries_listing_id_idx" ON "watchlist_entries"("listing_id");
