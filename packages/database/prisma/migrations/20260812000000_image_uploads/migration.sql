CREATE TYPE "MediaModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "media_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" UUID NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'cloudinary',
  "provider_asset_id" TEXT NOT NULL,
  "public_id" TEXT NOT NULL,
  "secure_url" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "bytes" INTEGER NOT NULL,
  "moderation_status" "MediaModerationStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_assets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "item_media" (
  "collection_item_id" UUID NOT NULL,
  "media_asset_id" UUID NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "item_media_pkey" PRIMARY KEY ("collection_item_id", "media_asset_id"),
  CONSTRAINT "item_media_collection_item_id_fkey" FOREIGN KEY ("collection_item_id") REFERENCES "collection_items"("id") ON DELETE CASCADE,
  CONSTRAINT "item_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "media_assets_provider_asset_id_key" ON "media_assets"("provider_asset_id");
CREATE UNIQUE INDEX "media_assets_public_id_key" ON "media_assets"("public_id");
CREATE INDEX "media_assets_owner_user_id_deleted_at_idx" ON "media_assets"("owner_user_id", "deleted_at");
CREATE UNIQUE INDEX "item_media_collection_item_id_position_key" ON "item_media"("collection_item_id", "position");
CREATE INDEX "item_media_media_asset_id_idx" ON "item_media"("media_asset_id");
CREATE UNIQUE INDEX "item_media_one_primary_per_item" ON "item_media"("collection_item_id") WHERE "is_primary" = true;
