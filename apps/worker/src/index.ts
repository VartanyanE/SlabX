import { createLogger } from "@slabx/observability";
import { createDatabasePool } from "@slabx/database";

const logger = createLogger("slabx-worker", process.env.LOG_LEVEL ?? "info");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  logger.warn("Worker idle because DATABASE_URL is not configured.");
else {
  const pool = createDatabasePool(databaseUrl);
  const run = async () => {
    try {
      const expired = await pool.query(
        `UPDATE offer_threads t SET status='EXPIRED',version=version+1,updated_at=CURRENT_TIMESTAMP FROM offer_revisions r WHERE t.status='OPEN' AND r.id=t.current_revision_id AND r.expires_at<=CURRENT_TIMESTAMP RETURNING t.id`,
      );
      const released = await pool.query(
        `UPDATE listings SET status='ACTIVE',reserved_by_user_id=NULL,reserved_until=NULL,reservation_reason=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE status='RESERVED' AND reservation_reason IN ('ACCEPTED_OFFER','CHECKOUT') AND reserved_until<=CURRENT_TIMESTAMP RETURNING id`,
      );
      const cancelledOrders = await pool.query(
        `UPDATE orders o SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP FROM listings l WHERE o.listing_id=l.id AND o.status='PENDING_PAYMENT' AND l.status='ACTIVE' AND l.reserved_by_user_id IS NULL RETURNING o.id`,
      );
      await pool.query(
        `UPDATE payment_attempts SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE order_id=ANY($1::uuid[]) AND status IN ('CREATED','PROCESSING')`,
        [cancelledOrders.rows.map((row: { id: string }) => row.id)],
      );
      await pool.query(
        `UPDATE outbox_events SET processed_at=CURRENT_TIMESTAMP WHERE processed_at IS NULL AND available_at<=CURRENT_TIMESTAMP`,
      );
      if (expired.rowCount || released.rowCount)
        logger.info(
          {
            expiredOffers: expired.rowCount,
            releasedListings: released.rowCount,
            cancelledOrders: cancelledOrders.rowCount,
          },
          "Offer expirations processed",
        );
    } catch (error) {
      logger.error({ err: error }, "Offer expiration worker failed");
    }
  };
  await run();
  setInterval(() => void run(), 30_000).unref();
  logger.info("Offer expiration worker ready.");
}
