CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'LABEL_PURCHASED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION');

CREATE TABLE "shipments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'mock',
  "provider_shipment_id" TEXT,
  "provider_tracker_id" TEXT,
  "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
  "carrier" TEXT,
  "service" TEXT,
  "tracking_code" TEXT,
  "tracking_url" TEXT,
  "label_url" TEXT,
  "postage_minor" BIGINT,
  "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "parcel_snapshot" JSONB NOT NULL,
  "from_address_snapshot" JSONB,
  "to_address_snapshot" JSONB NOT NULL,
  "rate_snapshot" JSONB,
  "label_idempotency_key" UUID,
  "estimated_delivery_at" TIMESTAMPTZ(6),
  "shipped_at" TIMESTAMPTZ(6),
  "delivered_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shipments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT,
  CONSTRAINT "shipments_order_id_key" UNIQUE ("order_id"),
  CONSTRAINT "shipments_provider_shipment_id_key" UNIQUE ("provider_shipment_id"),
  CONSTRAINT "shipments_provider_tracker_id_key" UNIQUE ("provider_tracker_id"),
  CONSTRAINT "shipments_tracking_code_key" UNIQUE ("tracking_code"),
  CONSTRAINT "shipments_label_idempotency_key_key" UNIQUE ("label_idempotency_key")
);

CREATE INDEX "shipments_status_updated_at_idx" ON "shipments"("status", "updated_at");

CREATE TABLE "tracking_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shipment_id" UUID NOT NULL,
  "provider_event_id" TEXT,
  "status" "ShipmentStatus" NOT NULL,
  "description" TEXT NOT NULL,
  "location" TEXT,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tracking_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE,
  CONSTRAINT "tracking_events_provider_event_id_key" UNIQUE ("provider_event_id")
);

CREATE INDEX "tracking_events_shipment_id_occurred_at_idx" ON "tracking_events"("shipment_id", "occurred_at");
