import pg from "pg";
import type { OfferCreate, OfferThread } from "@slabx/contracts";

export class OfferRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(buyerId: string, listingId: string, input: OfferCreate) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const duplicate = await client.query<{ threadId: string }>(
        `SELECT thread_id AS "threadId" FROM offer_revisions WHERE idempotency_key=$1`,
        [input.idempotencyKey],
      );
      if (duplicate.rowCount) {
        await client.query("COMMIT");
        return this.get(duplicate.rows[0]!.threadId, buyerId);
      }
      const listing = await client.query<{
        sellerId: string;
        price: number;
        minimum: number | null;
      }>(
        `SELECT seller_user_id AS "sellerId",price_minor::int AS price,minimum_offer_minor::int AS minimum FROM listings WHERE id=$1 AND status='ACTIVE' AND accepts_offers=true AND deleted_at IS NULL FOR UPDATE`,
        [listingId],
      );
      const target = listing.rows[0];
      if (!target || target.sellerId === buyerId)
        return await rollback(client, null);
      if (
        input.amountMinor >= target.price ||
        (target.minimum && input.amountMinor < target.minimum)
      )
        return await rollback(client, "AMOUNT");
      let thread = await client.query<{ id: string }>(
        `SELECT id FROM offer_threads WHERE listing_id=$1 AND buyer_user_id=$2 AND status='OPEN' FOR UPDATE`,
        [listingId, buyerId],
      );
      if (!thread.rowCount)
        thread = await client.query<{ id: string }>(
          `INSERT INTO offer_threads (listing_id,buyer_user_id,seller_user_id) VALUES ($1,$2,$3) RETURNING id`,
          [listingId, buyerId, target.sellerId],
        );
      const count = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM offer_revisions WHERE thread_id=$1 AND actor_user_id=$2`,
        [thread.rows[0]!.id, buyerId],
      );
      if ((count.rows[0]?.count ?? 0) >= 5)
        return await rollback(client, "LIMIT");
      const revision = await client.query<{ id: string }>(
        `INSERT INTO offer_revisions (thread_id,actor_user_id,kind,amount_minor,message,idempotency_key,expires_at) VALUES ($1,$2,'OFFER',$3,$4,$5,CURRENT_TIMESTAMP+INTERVAL '24 hours') RETURNING id`,
        [
          thread.rows[0]!.id,
          buyerId,
          input.amountMinor,
          input.message ?? null,
          input.idempotencyKey,
        ],
      );
      await client.query(
        `UPDATE offer_threads SET current_revision_id=$2,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [thread.rows[0]!.id, revision.rows[0]!.id],
      );
      await notify(
        client,
        target.sellerId,
        "OFFER_RECEIVED",
        thread.rows[0]!.id,
      );
      await client.query("COMMIT");
      return this.get(thread.rows[0]!.id, buyerId);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async counter(
    actorId: string,
    threadId: string,
    input: OfferCreate & { version: number },
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const duplicate = await client.query<{ threadId: string }>(
        `SELECT thread_id AS "threadId" FROM offer_revisions WHERE idempotency_key=$1`,
        [input.idempotencyKey],
      );
      if (duplicate.rowCount) {
        await client.query("COMMIT");
        return this.get(duplicate.rows[0]!.threadId, actorId);
      }
      const current = await client.query<{
        buyerId: string;
        sellerId: string;
        currentActor: string;
        amount: number;
        price: number;
        minimum: number | null;
      }>(
        `SELECT t.buyer_user_id AS "buyerId",t.seller_user_id AS "sellerId",r.actor_user_id AS "currentActor",r.amount_minor::int AS amount,l.price_minor::int AS price,l.minimum_offer_minor::int AS minimum FROM offer_threads t JOIN offer_revisions r ON r.id=t.current_revision_id JOIN listings l ON l.id=t.listing_id WHERE t.id=$1 AND t.status='OPEN' AND t.version=$2 AND r.expires_at>CURRENT_TIMESTAMP FOR UPDATE`,
        [threadId, input.version],
      );
      const state = current.rows[0];
      if (
        !state ||
        ![state.buyerId, state.sellerId].includes(actorId) ||
        state.currentActor === actorId
      )
        return await rollback(client, null);
      const isBuyer = actorId === state.buyerId;
      if (
        input.amountMinor >= state.price ||
        (state.minimum && input.amountMinor < state.minimum) ||
        (isBuyer
          ? input.amountMinor >= state.amount
          : input.amountMinor <= state.amount)
      )
        return await rollback(client, "AMOUNT");
      if (isBuyer) {
        const count = await client.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM offer_revisions WHERE thread_id=$1 AND actor_user_id=$2`,
          [threadId, actorId],
        );
        if ((count.rows[0]?.count ?? 0) >= 5)
          return await rollback(client, "LIMIT");
      }
      const revision = await client.query<{ id: string }>(
        `INSERT INTO offer_revisions (thread_id,actor_user_id,kind,amount_minor,message,idempotency_key,expires_at) VALUES ($1,$2,'COUNTER',$3,$4,$5,CURRENT_TIMESTAMP+INTERVAL '24 hours') RETURNING id`,
        [
          threadId,
          actorId,
          input.amountMinor,
          input.message ?? null,
          input.idempotencyKey,
        ],
      );
      await client.query(
        `UPDATE offer_threads SET current_revision_id=$2,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [threadId, revision.rows[0]!.id],
      );
      await notify(
        client,
        isBuyer ? state.sellerId : state.buyerId,
        "OFFER_COUNTERED",
        threadId,
      );
      await client.query("COMMIT");
      return this.get(threadId, actorId);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async resolve(
    actorId: string,
    threadId: string,
    version: number,
    action: "ACCEPTED" | "DECLINED" | "CANCELLED",
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{
        listingId: string;
        buyerId: string;
        sellerId: string;
        currentActor: string;
        amount: number;
      }>(
        `SELECT t.listing_id AS "listingId",t.buyer_user_id AS "buyerId",t.seller_user_id AS "sellerId",r.actor_user_id AS "currentActor",r.amount_minor::int AS amount FROM offer_threads t JOIN offer_revisions r ON r.id=t.current_revision_id WHERE t.id=$1 AND t.status='OPEN' AND t.version=$2 AND r.expires_at>CURRENT_TIMESTAMP FOR UPDATE`,
        [threadId, version],
      );
      const state = result.rows[0];
      if (!state) return await rollback(client, false);
      const isBuyer = actorId === state.buyerId;
      const isSeller = actorId === state.sellerId;
      if (
        (!isBuyer && !isSeller) ||
        (action === "CANCELLED"
          ? !isBuyer || state.currentActor !== actorId
          : state.currentActor === actorId)
      )
        return await rollback(client, false);
      if (action === "ACCEPTED") {
        const listing = await client.query(
          `UPDATE listings SET status='RESERVED',reserved_by_user_id=$2,reserved_until=CURRENT_TIMESTAMP+INTERVAL '30 minutes',reservation_reason='ACCEPTED_OFFER',version=version+1 WHERE id=$1 AND status='ACTIVE'`,
          [state.listingId, state.buyerId],
        );
        if (!listing.rowCount) return await rollback(client, false);
        await client.query(
          `UPDATE offer_threads SET status='EXPIRED',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE listing_id=$1 AND id<>$2 AND status='OPEN'`,
          [state.listingId, threadId],
        );
        await client.query(
          `UPDATE offer_threads SET status='ACCEPTED',accepted_price_minor=$2,checkout_expires_at=CURRENT_TIMESTAMP+INTERVAL '30 minutes',version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
          [threadId, state.amount],
        );
      } else
        await client.query(
          `UPDATE offer_threads SET status=$2::"OfferThreadStatus",version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
          [threadId, action],
        );
      await notify(
        client,
        isBuyer ? state.sellerId : state.buyerId,
        `OFFER_${action}`,
        threadId,
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async list(userId: string) {
    return (
      await this.pool.query<OfferThread>(
        `${threadSelect()} WHERE t.buyer_user_id=$1 OR t.seller_user_id=$1 ORDER BY t.updated_at DESC`,
        [userId],
      )
    ).rows;
  }
  async get(id: string, userId: string) {
    return (
      (
        await this.pool.query<OfferThread>(
          `${threadSelect()} WHERE t.id=$1 AND (t.buyer_user_id=$2 OR t.seller_user_id=$2)`,
          [id, userId],
        )
      ).rows[0] ?? null
    );
  }
}
async function rollback(client: pg.PoolClient, value: unknown) {
  await client.query("ROLLBACK");
  return value;
}
async function notify(
  client: pg.PoolClient,
  userId: string,
  type: string,
  threadId: string,
) {
  const payload = JSON.stringify({ threadId });
  await client.query(
    `INSERT INTO notifications (user_id,type,payload) VALUES ($1,$2,$3::jsonb)`,
    [userId, type, payload],
  );
  await client.query(
    `INSERT INTO outbox_events (topic,aggregate_id,payload) VALUES ('offer.notification',$1,$2::jsonb)`,
    [threadId, JSON.stringify({ userId, type, threadId })],
  );
}
function threadSelect() {
  return `SELECT t.id,t.listing_id AS "listingId",t.buyer_user_id AS "buyerUserId",t.seller_user_id AS "sellerUserId",t.status,t.accepted_price_minor::int AS "acceptedPriceMinor",t.checkout_expires_at::text AS "checkoutExpiresAt",t.version,json_build_object('id',l.id,'playerOrCharacter',c.player_or_character,'priceMinor',l.price_minor::int,'status',l.status) AS listing,COALESCE((SELECT json_agg(json_build_object('id',r.id,'actorUserId',r.actor_user_id,'kind',r.kind,'amountMinor',r.amount_minor::int,'message',r.message,'expiresAt',r.expires_at,'createdAt',r.created_at) ORDER BY r.created_at) FROM offer_revisions r WHERE r.thread_id=t.id),'[]'::json) AS revisions FROM offer_threads t JOIN listings l ON l.id=t.listing_id JOIN collection_items i ON i.id=l.collection_item_id JOIN catalog_cards c ON c.id=i.catalog_card_id`;
}
