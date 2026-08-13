import pg from "pg";
import type { ParcelInput, Shipment, ShippingRate } from "@slabx/contracts";
import type { PurchasedLabel, ShippingAddress } from "./provider.js";

export type EasyPostTrackingEvent = {
  id: string;
  trackerId: string;
  trackingCode: string;
  status: "LABEL_PURCHASED" | "IN_TRANSIT" | "DELIVERED" | "EXCEPTION";
  occurredAt: Date;
  description: string;
  payload: unknown;
};

export class ShippingRepository {
  constructor(private readonly pool: pg.Pool) {}

  async eligibleOrder(orderId: string, sellerId: string) {
    return (
      (
        await this.pool.query<{
          id: string;
          toAddress: ShippingAddress;
          fromAddress: ShippingAddress | null;
        }>(
          `SELECT o.id,o.shipping_address_snapshot AS "toAddress",(SELECT jsonb_build_object('recipientName',a.recipient_name,'line1',a.line1,'line2',a.line2,'city',a.city,'region',a.region,'postalCode',a.postal_code,'countryCode',a.country_code) FROM addresses a WHERE a.user_id=o.seller_user_id AND a.deleted_at IS NULL ORDER BY a.is_default_shipping DESC,a.created_at LIMIT 1) AS "fromAddress" FROM orders o WHERE o.id=$1 AND o.seller_user_id=$2 AND o.status='PAID'`,
          [orderId, sellerId],
        )
      ).rows[0] ?? null
    );
  }

  async prepare(
    orderId: string,
    parcel: ParcelInput,
    fromAddress: ShippingAddress,
    toAddress: ShippingAddress,
  ) {
    await this.pool.query(
      `INSERT INTO shipments (order_id,parcel_snapshot,from_address_snapshot,to_address_snapshot) VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb)
       ON CONFLICT (order_id) DO UPDATE SET parcel_snapshot=EXCLUDED.parcel_snapshot,from_address_snapshot=EXCLUDED.from_address_snapshot,updated_at=CURRENT_TIMESTAMP WHERE shipments.status='PENDING'`,
      [
        orderId,
        JSON.stringify(parcel),
        JSON.stringify(fromAddress),
        JSON.stringify(toAddress),
      ],
    );
  }

  async shipment(orderId: string, userId: string): Promise<Shipment | null> {
    return (
      (
        await this.pool.query<Shipment>(
          `${shipmentSelect()} WHERE s.order_id=$1 AND (o.buyer_user_id=$2 OR o.seller_user_id=$2) GROUP BY s.id`,
          [orderId, userId],
        )
      ).rows[0] ?? null
    );
  }

  async sellerShipment(orderId: string, sellerId: string) {
    return (
      (
        await this.pool.query<{
          id: string;
          status: string;
          parcel: ParcelInput;
          fromAddress: ShippingAddress;
          toAddress: ShippingAddress;
        }>(
          `SELECT s.id,s.status::text AS status,s.parcel_snapshot AS parcel,s.from_address_snapshot AS "fromAddress",s.to_address_snapshot AS "toAddress" FROM shipments s JOIN orders o ON o.id=s.order_id WHERE s.order_id=$1 AND o.seller_user_id=$2`,
          [orderId, sellerId],
        )
      ).rows[0] ?? null
    );
  }

  async buyLabel(options: {
    shipmentId: string;
    rate: ShippingRate;
    label: PurchasedLabel;
    idempotencyKey: string;
    provider: "mock" | "easypost";
  }) {
    const estimated = new Date(
      Date.now() + options.label.estimatedDays * 86_400_000,
    );
    await this.pool.query(
      `UPDATE shipments SET provider=$2,provider_shipment_id=$3,provider_tracker_id=$4,status='LABEL_PURCHASED',carrier=$5,service=$6,tracking_code=$7,tracking_url=$8,label_url=$9,postage_minor=$10,rate_snapshot=$11::jsonb,label_idempotency_key=$12,estimated_delivery_at=$13,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='PENDING'`,
      [
        options.shipmentId,
        options.provider,
        options.label.providerShipmentId,
        options.label.providerTrackerId,
        options.label.carrier,
        options.label.service,
        options.label.trackingCode,
        options.label.trackingUrl,
        options.label.labelUrl,
        options.label.postageMinor,
        JSON.stringify(options.rate),
        options.idempotencyKey,
        estimated,
      ],
    );
    await this.pool.query(
      `INSERT INTO tracking_events (shipment_id,provider_event_id,status,description,occurred_at) VALUES ($1,$2,'LABEL_PURCHASED','Shipping label created',CURRENT_TIMESTAMP) ON CONFLICT (provider_event_id) DO NOTHING`,
      [options.shipmentId, `label:${options.label.providerShipmentId}`],
    );
  }

  async processTrackingEvent(event: EasyPostTrackingEvent) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const received = await client.query(
        `INSERT INTO webhook_inbox (provider,provider_event_id,event_type,payload) VALUES ('easypost',$1,'tracker.updated',$2::jsonb) ON CONFLICT (provider,provider_event_id) DO NOTHING`,
        [event.id, JSON.stringify(event.payload)],
      );
      if (!received.rowCount) {
        await client.query("COMMIT");
        return;
      }
      const shipment = (
        await client.query<{ id: string; status: string }>(
          `SELECT id,status::text AS status FROM shipments WHERE provider='easypost' AND (provider_tracker_id=$1 OR tracking_code=$2) FOR UPDATE`,
          [event.trackerId, event.trackingCode],
        )
      ).rows[0];
      if (shipment) {
        await client.query(
          `INSERT INTO tracking_events (shipment_id,provider_event_id,status,description,occurred_at) VALUES ($1,$2,$3::"ShipmentStatus",$4,$5) ON CONFLICT (provider_event_id) DO NOTHING`,
          [
            shipment.id,
            event.id,
            event.status,
            event.description,
            event.occurredAt,
          ],
        );
        if (shipmentRank(event.status) >= shipmentRank(shipment.status))
          await client.query(
            `UPDATE shipments SET status=$2::"ShipmentStatus",shipped_at=CASE WHEN $2='IN_TRANSIT' THEN COALESCE(shipped_at,$3) ELSE shipped_at END,delivered_at=CASE WHEN $2='DELIVERED' THEN COALESCE(delivered_at,$3) ELSE delivered_at END,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
            [shipment.id, event.status, event.occurredAt],
          );
      }
      await client.query(
        `UPDATE webhook_inbox SET processed_at=CURRENT_TIMESTAMP WHERE provider='easypost' AND provider_event_id=$1`,
        [event.id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

function shipmentRank(status: string) {
  return (
    {
      PENDING: 0,
      LABEL_PURCHASED: 1,
      IN_TRANSIT: 2,
      EXCEPTION: 2,
      DELIVERED: 3,
    }[status] ?? 0
  );
}

function shipmentSelect() {
  return `SELECT s.id,s.order_id AS "orderId",s.status::text AS status,s.carrier,s.service,s.tracking_code AS "trackingCode",s.tracking_url AS "trackingUrl",s.label_url AS "labelUrl",s.postage_minor::int AS "postageMinor",s.estimated_delivery_at AS "estimatedDeliveryAt",s.shipped_at AS "shippedAt",s.delivered_at AS "deliveredAt",COALESCE(jsonb_agg(jsonb_build_object('id',te.id,'status',te.status::text,'description',te.description,'occurredAt',te.occurred_at) ORDER BY te.occurred_at) FILTER (WHERE te.id IS NOT NULL),'[]'::jsonb) AS events FROM shipments s JOIN orders o ON o.id=s.order_id LEFT JOIN tracking_events te ON te.shipment_id=s.id`;
}
