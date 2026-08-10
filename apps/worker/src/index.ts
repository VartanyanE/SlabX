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
        `UPDATE listings SET status='ACTIVE',reserved_by_user_id=NULL,reserved_until=NULL,reservation_reason=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE status='RESERVED' AND reservation_reason='ACCEPTED_OFFER' AND reserved_until<=CURRENT_TIMESTAMP RETURNING id`,
      );
      await pool.query(
        `UPDATE outbox_events SET processed_at=CURRENT_TIMESTAMP WHERE processed_at IS NULL AND available_at<=CURRENT_TIMESTAMP`,
      );
      if (expired.rowCount || released.rowCount)
        logger.info(
          {
            expiredOffers: expired.rowCount,
            releasedListings: released.rowCount,
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
