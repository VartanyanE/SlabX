import pg from "pg";
import type { CheckoutCreate, ConnectedAccount, Order } from "@slabx/contracts";
import type { PaymentEvent, ProviderAccount } from "./stripe.js";

export type CheckoutDraft = {
  orderId: string;
  orderNumber: string;
  itemName: string;
  amountMinor: number;
  platformFeeMinor: number;
  currency: "USD";
  providerAccountId: string;
  idempotencyKey: string;
};

export class PaymentRepository {
  constructor(private readonly pool: pg.Pool) {}

  async connectedAccount(
    userId: string,
  ): Promise<(ConnectedAccount & { providerAccountId?: string }) | null> {
    const row = (
      await this.pool.query<ConnectedAccount & { providerAccountId: string }>(
        `SELECT provider_account_id AS "providerAccountId",status::text AS status,details_submitted AS "detailsSubmitted",charges_enabled AS "chargesEnabled",payouts_enabled AS "payoutsEnabled",requirements_currently_due AS "requirementsCurrentlyDue" FROM connected_accounts WHERE user_id=$1`,
        [userId],
      )
    ).rows[0];
    return row ?? null;
  }

  async saveConnectedAccount(userId: string, account: ProviderAccount) {
    const status =
      account.chargesEnabled && account.payoutsEnabled
        ? "ACTIVE"
        : account.detailsSubmitted
          ? "RESTRICTED"
          : "PENDING";
    await this.pool.query(
      `INSERT INTO connected_accounts (user_id,provider_account_id,status,details_submitted,charges_enabled,payouts_enabled,requirements_currently_due) VALUES ($1,$2,$3::"ConnectedAccountStatus",$4,$5,$6,$7::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET provider_account_id=EXCLUDED.provider_account_id,status=EXCLUDED.status,details_submitted=EXCLUDED.details_submitted,charges_enabled=EXCLUDED.charges_enabled,payouts_enabled=EXCLUDED.payouts_enabled,requirements_currently_due=EXCLUDED.requirements_currently_due,updated_at=CURRENT_TIMESTAMP`,
      [
        userId,
        account.id,
        status,
        account.detailsSubmitted,
        account.chargesEnabled,
        account.payoutsEnabled,
        JSON.stringify(account.requirementsCurrentlyDue),
      ],
    );
    await this.pool.query(
      `UPDATE profiles SET seller_status=$2::"SellerStatus",updated_at=CURRENT_TIMESTAMP WHERE user_id=$1`,
      [
        userId,
        status === "ACTIVE"
          ? "ACTIVE"
          : status === "RESTRICTED"
            ? "RESTRICTED"
            : "PENDING",
      ],
    );
    return this.connectedAccount(userId);
  }

  async beginCheckout(
    buyerId: string,
    input: CheckoutCreate,
    orderNumber: string,
  ): Promise<CheckoutDraft | "NOT_AVAILABLE" | "SELLER_NOT_READY" | "ADDRESS"> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const duplicate = (
        await client.query<CheckoutDraft>(
          `SELECT o.id AS "orderId",o.order_number AS "orderNumber",(oi.catalog_card_snapshot->>'playerOrCharacter') AS "itemName",o.subtotal_minor::int AS "amountMinor",o.platform_fee_minor::int AS "platformFeeMinor",o.currency,ca.provider_account_id AS "providerAccountId",pa.idempotency_key AS "idempotencyKey" FROM payment_attempts pa JOIN orders o ON o.id=pa.order_id JOIN order_items oi ON oi.order_id=o.id JOIN connected_accounts ca ON ca.id=o.connected_account_id WHERE pa.idempotency_key=$1 AND pa.buyer_user_id=$2`,
          [input.idempotencyKey, buyerId],
        )
      ).rows[0];
      if (duplicate) {
        await client.query("COMMIT");
        return duplicate;
      }
      const address = (
        await client.query<{ snapshot: unknown }>(
          `SELECT jsonb_build_object('recipientName',recipient_name,'line1',line1,'line2',line2,'city',city,'region',region,'postalCode',postal_code,'countryCode',country_code) AS snapshot FROM addresses WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL AND country_code='US'`,
          [input.shippingAddressId, buyerId],
        )
      ).rows[0];
      if (!address) {
        await client.query("ROLLBACK");
        return "ADDRESS";
      }
      const source = (
        await client.query<{
          listingId: string;
          sellerId: string;
          collectionItemId: string;
          amountMinor: number;
          currency: "USD";
          connectedAccountId: string | null;
          providerAccountId: string | null;
          connectedStatus: string | null;
          listingSnapshot: unknown;
          itemSnapshot: unknown;
          cardSnapshot: Record<string, unknown>;
        }>(
          `SELECT l.id AS "listingId",l.seller_user_id AS "sellerId",l.collection_item_id AS "collectionItemId",
          CASE WHEN $2::uuid IS NULL THEN l.price_minor ELSE ot.accepted_price_minor END::int AS "amountMinor",l.currency,
          ca.id AS "connectedAccountId",ca.provider_account_id AS "providerAccountId",ca.status::text AS "connectedStatus",
          jsonb_build_object('listingId',l.id,'priceMinor',l.price_minor::text,'currency',l.currency,'conditionDisclosure',l.condition_disclosure) AS "listingSnapshot",
          jsonb_build_object('collectionItemId',ci.id,'conditionType',ci.condition_type,'rawCondition',ci.raw_condition,'grade',ci.grade,'certificationNumber',ci.certification_number) AS "itemSnapshot",
          jsonb_build_object('catalogCardId',cc.id,'playerOrCharacter',cc.player_or_character,'year',cc.year,'setName',cs.name,'cardNumber',cc.card_number,
            'imageUrl',(SELECT ma.secure_url FROM item_media im JOIN media_assets ma ON ma.id=im.media_asset_id WHERE im.collection_item_id=ci.id ORDER BY im.is_primary DESC,im.position LIMIT 1)) AS "cardSnapshot"
        FROM listings l JOIN collection_items ci ON ci.id=l.collection_item_id JOIN catalog_cards cc ON cc.id=ci.catalog_card_id JOIN card_sets cs ON cs.id=cc.card_set_id
        LEFT JOIN connected_accounts ca ON ca.user_id=l.seller_user_id LEFT JOIN offer_threads ot ON ot.id=$2
        WHERE l.seller_user_id<>$3 AND l.currency='USD' AND (
          ($2::uuid IS NULL AND l.id=$1 AND (l.status='ACTIVE' OR (l.status='RESERVED' AND l.reserved_by_user_id=$3 AND l.reserved_until>CURRENT_TIMESTAMP))) OR
          ($2::uuid IS NOT NULL AND ot.listing_id=l.id AND ot.buyer_user_id=$3 AND ot.status='ACCEPTED' AND ot.checkout_expires_at>CURRENT_TIMESTAMP AND l.status='RESERVED' AND l.reserved_by_user_id=$3 AND l.reserved_until>CURRENT_TIMESTAMP)
        ) FOR UPDATE OF l`,
          [input.listingId ?? null, input.offerThreadId ?? null, buyerId],
        )
      ).rows[0];
      if (!source) {
        await client.query("ROLLBACK");
        return "NOT_AVAILABLE";
      }
      if (
        !source.connectedAccountId ||
        !source.providerAccountId ||
        source.connectedStatus !== "ACTIVE"
      ) {
        await client.query("ROLLBACK");
        return "SELLER_NOT_READY";
      }
      const fee = marketplaceFeeMinor(source.amountMinor);
      const order = (
        await client.query<{ id: string }>(
          `INSERT INTO orders (order_number,buyer_user_id,seller_user_id,listing_id,offer_thread_id,connected_account_id,currency,subtotal_minor,platform_fee_minor,seller_proceeds_minor,shipping_address_snapshot) VALUES ($1,$2,$3,$4,$5,$6,'USD',$7,$8,$9,$10::jsonb) RETURNING id`,
          [
            orderNumber,
            buyerId,
            source.sellerId,
            source.listingId,
            input.offerThreadId ?? null,
            source.connectedAccountId,
            source.amountMinor,
            fee,
            source.amountMinor - fee,
            JSON.stringify(address.snapshot),
          ],
        )
      ).rows[0]!;
      await client.query(
        `INSERT INTO order_items (order_id,listing_snapshot,collection_item_snapshot,catalog_card_snapshot) VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb)`,
        [
          order.id,
          JSON.stringify(source.listingSnapshot),
          JSON.stringify(source.itemSnapshot),
          JSON.stringify(source.cardSnapshot),
        ],
      );
      await client.query(
        `INSERT INTO payment_attempts (order_id,buyer_user_id,idempotency_key) VALUES ($1,$2,$3)`,
        [order.id, buyerId, input.idempotencyKey],
      );
      await client.query(
        `UPDATE listings SET status='RESERVED',reserved_by_user_id=$2,reserved_until=CURRENT_TIMESTAMP+INTERVAL '30 minutes',reservation_reason='CHECKOUT',version=version+1 WHERE id=$1`,
        [source.listingId, buyerId],
      );
      await client.query("COMMIT");
      return {
        orderId: order.id,
        orderNumber,
        itemName: String(
          source.cardSnapshot.playerOrCharacter ?? "Collectible card",
        ),
        amountMinor: source.amountMinor,
        platformFeeMinor: fee,
        currency: "USD",
        providerAccountId: source.providerAccountId,
        idempotencyKey: input.idempotencyKey,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof Error && "code" in error && error.code === "23505")
        return "NOT_AVAILABLE";
      throw error;
    } finally {
      client.release();
    }
  }

  async attachCheckout(orderId: string, checkoutId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE payment_attempts SET provider_checkout_id=$2,status='PROCESSING',failure_code=NULL,failure_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE order_id=$1 AND status IN ('CREATED','FAILED','PROCESSING')`,
        [orderId, checkoutId],
      );
      await client.query(
        `UPDATE orders SET status='PENDING_PAYMENT',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='PAYMENT_FAILED'`,
        [orderId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async failCheckout(orderId: string, message: string) {
    await this.pool.query(
      `UPDATE payment_attempts SET status='FAILED',failure_code='PROVIDER_ERROR',failure_message=$2,updated_at=CURRENT_TIMESTAMP WHERE order_id=$1 AND status IN ('CREATED','PROCESSING')`,
      [orderId, message.slice(0, 500)],
    );
    await this.pool.query(
      `UPDATE orders SET status='PAYMENT_FAILED',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='PENDING_PAYMENT'`,
      [orderId],
    );
  }

  async processEvent(event: PaymentEvent) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO webhook_inbox (provider,provider_event_id,event_type,payload) VALUES ('stripe',$1,$2,$3::jsonb) ON CONFLICT (provider,provider_event_id) DO NOTHING`,
        [event.id, event.type, JSON.stringify(event.payload)],
      );
      if (!inserted.rowCount) {
        await client.query("COMMIT");
        return;
      }
      if (event.account) {
        const status =
          event.account.chargesEnabled && event.account.payoutsEnabled
            ? "ACTIVE"
            : event.account.detailsSubmitted
              ? "RESTRICTED"
              : "PENDING";
        await client.query(
          `UPDATE connected_accounts SET status=$2::"ConnectedAccountStatus",details_submitted=$3,charges_enabled=$4,payouts_enabled=$5,requirements_currently_due=$6::jsonb,updated_at=CURRENT_TIMESTAMP WHERE provider_account_id=$1`,
          [
            event.account.id,
            status,
            event.account.detailsSubmitted,
            event.account.chargesEnabled,
            event.account.payoutsEnabled,
            JSON.stringify(event.account.requirementsCurrentlyDue),
          ],
        );
        await client.query(
          `UPDATE profiles p SET seller_status=$2::"SellerStatus",updated_at=CURRENT_TIMESTAMP FROM connected_accounts ca WHERE ca.user_id=p.user_id AND ca.provider_account_id=$1`,
          [
            event.account.id,
            status === "ACTIVE"
              ? "ACTIVE"
              : status === "RESTRICTED"
                ? "RESTRICTED"
                : "PENDING",
          ],
        );
      }
      if (event.checkout?.paid && event.checkout.orderId) {
        const order = (
          await client.query<{
            id: string;
            listingId: string;
            amount: number;
            fee: number;
            proceeds: number;
            currency: string;
          }>(
            `SELECT id,listing_id AS "listingId",subtotal_minor::int AS amount,platform_fee_minor::int AS fee,seller_proceeds_minor::int AS proceeds,currency FROM orders WHERE id=$1 AND status='PENDING_PAYMENT' FOR UPDATE`,
            [event.checkout.orderId],
          )
        ).rows[0];
        if (order) {
          if (
            event.checkout.amountTotal !== order.amount ||
            event.checkout.currency?.toUpperCase() !== order.currency
          )
            throw new Error(
              "Stripe checkout amount does not match order snapshot.",
            );
          await client.query(
            `UPDATE payment_attempts SET status='SUCCEEDED',provider_checkout_id=COALESCE(provider_checkout_id,$3),provider_payment_intent_id=$2,updated_at=CURRENT_TIMESTAMP WHERE order_id=$1 AND (provider_checkout_id=$3 OR provider_checkout_id IS NULL)`,
            [order.id, event.checkout.paymentIntentId, event.checkout.id],
          );
          await client.query(
            `UPDATE orders SET status='PAID',paid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
            [order.id],
          );
          await client.query(
            `UPDATE listings SET status='CLOSED',reserved_by_user_id=NULL,reserved_until=NULL,reservation_reason='SOLD',version=version+1 WHERE id=$1`,
            [order.listingId],
          );
          await client.query(
            `UPDATE collection_items ci SET availability_status='SOLD',version=version+1,updated_at=CURRENT_TIMESTAMP FROM listings l WHERE l.collection_item_id=ci.id AND l.id=$1`,
            [order.listingId],
          );
          const [clearing, payable, revenue] = ledgerAmounts(
            order.amount,
            order.fee,
          );
          await client.query(
            `INSERT INTO ledger_entries (order_id,account_code,amount_minor,currency,description) VALUES ($1,'STRIPE_CLEARING',$2,$5,'Buyer payment'),($1,'SELLER_PAYABLE',$3,$5,'Seller proceeds'),($1,'PLATFORM_FEE_REVENUE',$4,$5,'SlabX marketplace fee')`,
            [order.id, clearing, payable, revenue, order.currency],
          );
          await client.query(
            `INSERT INTO notifications (user_id,type,payload) SELECT buyer_user_id,'ORDER_PAID',jsonb_build_object('orderId',id) FROM orders WHERE id=$1 UNION ALL SELECT seller_user_id,'ORDER_PAID',jsonb_build_object('orderId',id) FROM orders WHERE id=$1`,
            [order.id],
          );
        }
      }
      if (event.dispute?.paymentIntentId) {
        const order = (
          await client.query<{
            id: string;
            sellerId: string;
            proceeds: number;
          }>(
            `SELECT o.id,o.seller_user_id AS "sellerId",o.seller_proceeds_minor::int AS proceeds
             FROM orders o JOIN payment_attempts pa ON pa.order_id=o.id
             WHERE pa.provider_payment_intent_id=$1 FOR UPDATE OF o`,
            [event.dispute.paymentIntentId],
          )
        ).rows[0];
        if (order) {
          await client.query(
            `INSERT INTO disputes (order_id,provider_dispute_id,provider_charge_id,amount_minor,currency,reason,status,evidence_due_at,closed_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7::"DisputeStatus",$8,CASE WHEN $7 IN ('WON','LOST') THEN CURRENT_TIMESTAMP END)
             ON CONFLICT (provider_dispute_id) DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason,evidence_due_at=EXCLUDED.evidence_due_at,
               closed_at=CASE WHEN EXCLUDED.status IN ('WON','LOST') THEN CURRENT_TIMESTAMP ELSE disputes.closed_at END,updated_at=CURRENT_TIMESTAMP`,
            [
              order.id,
              event.dispute.id,
              event.dispute.chargeId,
              event.dispute.amountMinor,
              event.dispute.currency,
              event.dispute.reason,
              event.dispute.status,
              event.dispute.evidenceDueAt,
            ],
          );
          if (!["WON", "LOST"].includes(event.dispute.status))
            await client.query(
              `INSERT INTO payout_holds (order_id,seller_user_id,amount_minor,currency,reason_code)
               SELECT $1,$2,$3,$4,'STRIPE_DISPUTE' WHERE NOT EXISTS (SELECT 1 FROM payout_holds WHERE order_id=$1 AND reason_code='STRIPE_DISPUTE' AND status='ACTIVE')`,
              [
                order.id,
                order.sellerId,
                Math.min(order.proceeds, event.dispute.amountMinor),
                event.dispute.currency,
              ],
            );
          else
            await client.query(
              `UPDATE payout_holds SET status=$2::"PayoutHoldStatus",released_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
               WHERE order_id=$1 AND reason_code='STRIPE_DISPUTE' AND status='ACTIVE'`,
              [
                order.id,
                event.dispute.status === "WON" ? "RELEASED" : "CONSUMED",
              ],
            );
        }
      }
      if (event.transfer) {
        await client.query(
          `INSERT INTO seller_transfers (order_id,provider_transfer_id,amount_minor,currency,status,idempotency_key)
           SELECT o.id,$2,$3,$4,'SUCCEEDED',gen_random_uuid()
           FROM orders o LEFT JOIN payment_attempts pa ON pa.order_id=o.id
           WHERE pa.provider_payment_intent_id=$1 OR o.id=$5
           ON CONFLICT (provider_transfer_id) DO UPDATE SET status='SUCCEEDED',updated_at=CURRENT_TIMESTAMP`,
          [
            event.transfer.paymentIntentId,
            event.transfer.id,
            event.transfer.amountMinor,
            event.transfer.currency,
            event.transfer.orderId,
          ],
        );
        await client.query(
          `INSERT INTO reconciliation_records (order_id,provider,provider_type,provider_id,amount_minor,currency,expected_minor,difference_minor)
           SELECT o.id,'stripe','transfer',$2,$3,$4,o.seller_proceeds_minor,($3-o.seller_proceeds_minor)
           FROM orders o LEFT JOIN payment_attempts pa ON pa.order_id=o.id WHERE pa.provider_payment_intent_id=$1 OR o.id=$5
           ON CONFLICT (provider,provider_type,provider_id) DO UPDATE SET amount_minor=EXCLUDED.amount_minor,expected_minor=EXCLUDED.expected_minor,difference_minor=EXCLUDED.difference_minor,reconciled_at=CURRENT_TIMESTAMP`,
          [
            event.transfer.paymentIntentId,
            event.transfer.id,
            event.transfer.amountMinor,
            event.transfer.currency,
            event.transfer.orderId,
          ],
        );
      }
      if (event.payout) {
        await client.query(
          `INSERT INTO payout_records (connected_account_id,provider_payout_id,amount_minor,currency,status,arrival_at,failure_code,failure_message)
           SELECT id,$2,$3,$4,$5::"PayoutStatus",$6,$7,$8 FROM connected_accounts WHERE provider_account_id=$1
           ON CONFLICT (provider_payout_id) DO UPDATE SET status=EXCLUDED.status,arrival_at=EXCLUDED.arrival_at,failure_code=EXCLUDED.failure_code,failure_message=EXCLUDED.failure_message,updated_at=CURRENT_TIMESTAMP`,
          [
            event.payout.connectedAccountId,
            event.payout.id,
            event.payout.amountMinor,
            event.payout.currency,
            event.payout.status,
            event.payout.arrivalAt,
            event.payout.failureCode,
            event.payout.failureMessage,
          ],
        );
      }
      await client.query(
        `UPDATE webhook_inbox SET processed_at=CURRENT_TIMESTAMP WHERE provider='stripe' AND provider_event_id=$1`,
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

  async order(id: string, userId: string) {
    return (
      (
        await this.pool.query<Order>(
          `${orderSelect()} WHERE o.id=$1 AND (o.buyer_user_id=$2 OR o.seller_user_id=$2)`,
          [id, userId],
        )
      ).rows[0] ?? null
    );
  }
  async orders(userId: string) {
    return (
      await this.pool.query<Order>(
        `${orderSelect()} WHERE o.buyer_user_id=$1 OR o.seller_user_id=$1 ORDER BY o.created_at DESC`,
        [userId],
      )
    ).rows;
  }
}

export function marketplaceFeeMinor(subtotalMinor: number) {
  return Math.round(subtotalMinor * 0.08);
}

export function ledgerAmounts(subtotalMinor: number, platformFeeMinor: number) {
  return [
    subtotalMinor,
    -(subtotalMinor - platformFeeMinor),
    -platformFeeMinor,
  ] as const;
}

function orderSelect() {
  return `SELECT o.id,o.order_number AS "orderNumber",o.status::text AS status,o.buyer_user_id AS "buyerUserId",o.seller_user_id AS "sellerUserId",o.listing_id AS "listingId",o.subtotal_minor::int AS "subtotalMinor",o.platform_fee_minor::int AS "platformFeeMinor",o.seller_proceeds_minor::int AS "sellerProceedsMinor",o.currency,o.paid_at AS "paidAt",o.created_at AS "createdAt",jsonb_build_object('playerOrCharacter',oi.catalog_card_snapshot->>'playerOrCharacter','year',(oi.catalog_card_snapshot->>'year')::int,'setName',oi.catalog_card_snapshot->>'setName','cardNumber',oi.catalog_card_snapshot->>'cardNumber','imageUrl',oi.catalog_card_snapshot->>'imageUrl') AS item,NULL::jsonb AS shipment FROM orders o JOIN order_items oi ON oi.order_id=o.id`;
}
