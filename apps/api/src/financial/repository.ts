import pg from "pg";
import type { RefundRequestInput } from "@slabx/contracts";

export type RefundExecution = {
  refundId: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  paymentIntentId: string;
  idempotencyKey: string;
  subtotalMinor: number;
  platformFeeMinor: number;
};

export class FinancialRepository {
  constructor(private readonly pool: pg.Pool) {}

  async requestRefund(userId: string, input: RefundRequestInput) {
    const result = await this.pool.query(
      `INSERT INTO refund_requests (order_id,requester_user_id,amount_minor,reason_code,details,idempotency_key)
       SELECT o.id,$1,$3,$4,$5,$6 FROM orders o
       WHERE o.id=$2 AND o.buyer_user_id=$1 AND o.status='PAID' AND $3>0
         AND $3<=o.subtotal_minor-COALESCE((SELECT sum(amount_minor) FROM refund_requests r WHERE r.order_id=o.id AND r.status IN ('APPROVED','PROCESSING','SUCCEEDED')),0)
       ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
       RETURNING id,order_id AS "orderId",amount_minor::int AS "amountMinor",currency,reason_code AS "reasonCode",details,status,created_at AS "createdAt"`,
      [
        userId,
        input.orderId,
        input.amountMinor,
        input.reasonCode,
        input.details,
        input.idempotencyKey,
      ],
    );
    return result.rows[0] ?? null;
  }

  async beginApproval(refundId: string): Promise<RefundExecution | null> {
    const result = await this.pool.query<RefundExecution>(
      `UPDATE refund_requests r SET status='PROCESSING',updated_at=CURRENT_TIMESTAMP
       FROM orders o JOIN payment_attempts pa ON pa.order_id=o.id AND pa.status='SUCCEEDED'
       WHERE r.id=$1 AND r.order_id=o.id AND r.status IN ('REQUESTED','APPROVED','FAILED') AND pa.provider_payment_intent_id IS NOT NULL
       RETURNING r.id AS "refundId",r.order_id AS "orderId",r.amount_minor::int AS "amountMinor",r.currency,
         pa.provider_payment_intent_id AS "paymentIntentId",r.idempotency_key AS "idempotencyKey",
         o.subtotal_minor::int AS "subtotalMinor",o.platform_fee_minor::int AS "platformFeeMinor"`,
      [refundId],
    );
    return result.rows[0] ?? null;
  }

  async completeRefund(
    execution: RefundExecution,
    providerRefundId: string,
    actorId: string,
  ) {
    const feeReversal = Math.round(
      (execution.amountMinor * execution.platformFeeMinor) /
        execution.subtotalMinor,
    );
    const sellerReversal = execution.amountMinor - feeReversal;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE refund_requests SET status='SUCCEEDED',provider_refund_id=$2,resolved_at=CURRENT_TIMESTAMP,failure_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='PROCESSING'`,
        [execution.refundId, providerRefundId],
      );
      await client.query(
        `INSERT INTO ledger_entries (order_id,account_code,amount_minor,currency,description) VALUES
         ($1,'STRIPE_CLEARING_REFUND',$2,$3,'Buyer refund issued'),
         ($1,'SELLER_PAYABLE_REVERSAL',$4,$3,'Seller proceeds reversed for refund'),
         ($1,'PLATFORM_FEE_REVERSAL',$5,$3,'Marketplace fee reversed for refund')`,
        [
          execution.orderId,
          -execution.amountMinor,
          execution.currency,
          sellerReversal,
          feeReversal,
        ],
      );
      await client.query(
        `INSERT INTO reconciliation_records (order_id,provider,provider_type,provider_id,amount_minor,currency,expected_minor,difference_minor)
         VALUES ($1,'stripe','refund',$2,$3,$4,$3,0) ON CONFLICT DO NOTHING`,
        [
          execution.orderId,
          providerRefundId,
          execution.amountMinor,
          execution.currency,
        ],
      );
      await client.query(
        `INSERT INTO audit_events (actor_user_id,action,target_type,target_id,metadata)
         VALUES ($1,'REFUND_APPROVED','REFUND',$2,jsonb_build_object('providerRefundId',$3,'amountMinor',$4))`,
        [actorId, execution.refundId, providerRefundId, execution.amountMinor],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async failRefund(refundId: string, message: string) {
    await this.pool.query(
      `UPDATE refund_requests SET status='FAILED',failure_message=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='PROCESSING'`,
      [refundId, message.slice(0, 500)],
    );
  }

  async rejectRefund(actorId: string, refundId: string, note: string) {
    const result = await this.pool.query(
      `WITH changed AS (UPDATE refund_requests SET status='REJECTED',resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND status='REQUESTED' RETURNING id)
       INSERT INTO audit_events (actor_user_id,action,target_type,target_id,metadata)
       SELECT $1,'REFUND_REJECTED','REFUND',id,jsonb_build_object('note',$3) FROM changed RETURNING id`,
      [actorId, refundId, note],
    );
    return Boolean(result.rowCount);
  }

  async list(userId: string, staff: boolean) {
    return (
      await this.pool.query(
        `SELECT r.id,r.order_id AS "orderId",r.amount_minor::int AS "amountMinor",r.currency,r.reason_code AS "reasonCode",r.details,r.status,r.failure_message AS "failureMessage",r.created_at AS "createdAt"
       FROM refund_requests r JOIN orders o ON o.id=r.order_id
       WHERE $2 OR o.buyer_user_id=$1 OR o.seller_user_id=$1 ORDER BY r.created_at DESC LIMIT 100`,
        [userId, staff],
      )
    ).rows;
  }

  async overview() {
    const [totals, disputes, holds, differences] = await Promise.all([
      this.pool.query<{
        openRefunds: number;
        openDisputes: number;
        activeHoldsMinor: number;
        reconciliationDifferenceMinor: number;
      }>(
        `SELECT
          (SELECT count(*)::int FROM refund_requests WHERE status IN ('REQUESTED','APPROVED','PROCESSING','FAILED')) AS "openRefunds",
          (SELECT count(*)::int FROM disputes WHERE status NOT IN ('WON','LOST')) AS "openDisputes",
          (SELECT COALESCE(sum(amount_minor),0)::int FROM payout_holds WHERE status='ACTIVE') AS "activeHoldsMinor",
          (SELECT COALESCE(sum(abs(difference_minor)),0)::int FROM reconciliation_records) AS "reconciliationDifferenceMinor"`,
      ),
      this.pool.query(
        `SELECT id,order_id AS "orderId",amount_minor::int AS "amountMinor",reason,status,evidence_due_at AS "evidenceDueAt" FROM disputes ORDER BY updated_at DESC LIMIT 50`,
      ),
      this.pool.query(
        `SELECT id,order_id AS "orderId",amount_minor::int AS "amountMinor",reason_code AS "reasonCode",status,release_at AS "releaseAt" FROM payout_holds ORDER BY updated_at DESC LIMIT 50`,
      ),
      this.pool.query(
        `SELECT id,order_id AS "orderId",provider_type AS "providerType",provider_id AS "providerId",difference_minor::int AS "differenceMinor",reconciled_at AS "reconciledAt" FROM reconciliation_records WHERE difference_minor<>0 ORDER BY reconciled_at DESC LIMIT 50`,
      ),
    ]);
    return {
      ...totals.rows[0]!,
      disputes: disputes.rows,
      holds: holds.rows,
      differences: differences.rows,
    };
  }

  async sellerSummary(userId: string) {
    const [totals, payouts] = await Promise.all([
      this.pool.query<{
        lifetimeProceedsMinor: number;
        refundedMinor: number;
        activeHoldsMinor: number;
        paidOutMinor: number;
      }>(
        `SELECT
          COALESCE((SELECT sum(seller_proceeds_minor) FROM orders WHERE seller_user_id=$1 AND status='PAID'),0)::int AS "lifetimeProceedsMinor",
          COALESCE((SELECT sum(le.amount_minor) FROM ledger_entries le JOIN orders o ON o.id=le.order_id WHERE o.seller_user_id=$1 AND le.account_code='SELLER_PAYABLE_REVERSAL'),0)::int AS "refundedMinor",
          COALESCE((SELECT sum(amount_minor) FROM payout_holds WHERE seller_user_id=$1 AND status='ACTIVE'),0)::int AS "activeHoldsMinor",
          COALESCE((SELECT sum(pr.amount_minor) FROM payout_records pr JOIN connected_accounts ca ON ca.id=pr.connected_account_id WHERE ca.user_id=$1 AND pr.status='PAID'),0)::int AS "paidOutMinor"`,
        [userId],
      ),
      this.pool.query(
        `SELECT pr.id,pr.amount_minor::int AS "amountMinor",pr.status,pr.arrival_at AS "arrivalAt",pr.created_at AS "createdAt" FROM payout_records pr JOIN connected_accounts ca ON ca.id=pr.connected_account_id WHERE ca.user_id=$1 ORDER BY pr.created_at DESC LIMIT 25`,
        [userId],
      ),
    ]);
    return {
      ...totals.rows[0]!,
      currency: "USD" as const,
      payouts: payouts.rows,
    };
  }
}
