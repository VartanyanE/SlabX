CREATE TYPE "CatalogCardStatus" AS ENUM ('PENDING_REVIEW','ACTIVE','MERGED','REJECTED');
CREATE TYPE "CollectionConditionType" AS ENUM ('RAW','GRADED');
CREATE TYPE "RawCondition" AS ENUM ('POOR','FAIR','GOOD','VERY_GOOD','EXCELLENT','NEAR_MINT','MINT');
CREATE TYPE "CollectionVisibility" AS ENUM ('PRIVATE','PUBLIC');
CREATE TYPE "CollectionAvailability" AS ENUM ('AVAILABLE','NOT_FOR_SALE','LISTED','RESERVED','SOLD','TRADE_LOCKED');

CREATE TABLE "categories" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "slug" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "attributes_schema" JSONB NOT NULL DEFAULT '{}', "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "manufacturers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "name_normalized" TEXT NOT NULL UNIQUE,
  "name_display" TEXT NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "card_sets" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "category_id" UUID NOT NULL REFERENCES "categories"("id"),
  "manufacturer_id" UUID NOT NULL REFERENCES "manufacturers"("id"), "name" TEXT NOT NULL,
  "name_normalized" TEXT NOT NULL, "year_start" INTEGER NOT NULL, "year_end" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("category_id","manufacturer_id","name_normalized","year_start")
);
CREATE INDEX "card_sets_category_id_year_start_idx" ON "card_sets"("category_id","year_start");
CREATE TABLE "catalog_cards" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "category_id" UUID NOT NULL REFERENCES "categories"("id"),
  "card_set_id" UUID NOT NULL REFERENCES "card_sets"("id"), "player_or_character" TEXT NOT NULL,
  "player_normalized" TEXT NOT NULL, "year" INTEGER NOT NULL, "card_number" TEXT NOT NULL,
  "subset" TEXT, "variant" TEXT, "language_code" CHAR(2) NOT NULL DEFAULT 'en',
  "is_rookie" BOOLEAN NOT NULL DEFAULT false, "is_autograph" BOOLEAN NOT NULL DEFAULT false,
  "is_memorabilia" BOOLEAN NOT NULL DEFAULT false, "serial_total" INTEGER, "attributes" JSONB NOT NULL DEFAULT '{}',
  "fingerprint" TEXT NOT NULL UNIQUE, "status" "CatalogCardStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "created_by_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL, "merged_into_id" UUID REFERENCES "catalog_cards"("id"),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6)
);
CREATE INDEX "catalog_cards_category_id_year_status_idx" ON "catalog_cards"("category_id","year","status");
CREATE INDEX "catalog_cards_card_set_id_card_number_idx" ON "catalog_cards"("card_set_id","card_number");
CREATE INDEX "catalog_cards_player_normalized_idx" ON "catalog_cards"("player_normalized");
CREATE TABLE "grading_companies" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "code" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
  "grade_scale" JSONB NOT NULL, "cert_verification_url_template" TEXT, "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "collection_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "owner_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "catalog_card_id" UUID NOT NULL REFERENCES "catalog_cards"("id"), "condition_type" "CollectionConditionType" NOT NULL,
  "raw_condition" "RawCondition", "grading_company_id" UUID REFERENCES "grading_companies"("id"),
  "grade" DECIMAL(4,2), "certification_number" TEXT, "item_notes" TEXT,
  "visibility" "CollectionVisibility" NOT NULL DEFAULT 'PRIVATE',
  "availability_status" "CollectionAvailability" NOT NULL DEFAULT 'NOT_FOR_SALE',
  "acquired_at" DATE, "acquisition_price_minor" INTEGER, "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "collection_items_condition_check" CHECK (
    (condition_type='RAW' AND raw_condition IS NOT NULL AND grading_company_id IS NULL AND grade IS NULL AND certification_number IS NULL)
    OR (condition_type='GRADED' AND raw_condition IS NULL AND grading_company_id IS NOT NULL AND grade IS NOT NULL AND certification_number IS NOT NULL)
  )
);
CREATE INDEX "collection_items_owner_user_id_availability_status_deleted_at_idx" ON "collection_items"("owner_user_id","availability_status","deleted_at");
CREATE INDEX "collection_items_catalog_card_id_idx" ON "collection_items"("catalog_card_id");
CREATE INDEX "collection_items_grading_company_id_certification_number_idx" ON "collection_items"("grading_company_id","certification_number");
CREATE UNIQUE INDEX "collection_items_active_certification_key" ON "collection_items"("grading_company_id","certification_number")
  WHERE "deleted_at" IS NULL AND "certification_number" IS NOT NULL;
