import pg from "pg";
import type { ReportInput, ReviewInput, TrustSummary } from "@slabx/contracts";

export class TrustRepository {
  constructor(private readonly pool: pg.Pool) {}

  async createReview(authorId: string, input: ReviewInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const eligible = await client.query<{
        buyerId: string;
        sellerId: string;
      }>(
        `SELECT o.buyer_user_id AS "buyerId",o.seller_user_id AS "sellerId"
         FROM orders o JOIN shipments s ON s.order_id=o.id
         WHERE o.id=$1 AND s.status='DELIVERED' FOR UPDATE`,
        [input.orderId],
      );
      const order = eligible.rows[0];
      if (!order || ![order.buyerId, order.sellerId].includes(authorId)) {
        await client.query("ROLLBACK");
        return null;
      }
      const subjectId =
        authorId === order.buyerId ? order.sellerId : order.buyerId;
      const role =
        authorId === order.buyerId
          ? "BUYER_REVIEWING_SELLER"
          : "SELLER_REVIEWING_BUYER";
      const review = await client.query(
        `INSERT INTO reviews (order_id,author_user_id,subject_user_id,role,rating,comment)
         VALUES ($1,$2,$3,$4::"ReviewRole",$5,$6)
         ON CONFLICT (order_id,author_user_id) DO NOTHING RETURNING *`,
        [
          input.orderId,
          authorId,
          subjectId,
          role,
          input.rating,
          input.comment ?? null,
        ],
      );
      if (!review.rowCount) {
        await client.query("ROLLBACK");
        return "DUPLICATE" as const;
      }
      const counterpart = await client.query(
        `SELECT id FROM reviews WHERE order_id=$1 AND author_user_id<>$2 FOR UPDATE`,
        [input.orderId, authorId],
      );
      if (counterpart.rowCount)
        await client.query(
          `UPDATE reviews SET published_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE order_id=$1`,
          [input.orderId],
        );
      await client.query(
        `UPDATE profiles p SET rating_average=a.average,rating_count=a.count,updated_at=CURRENT_TIMESTAMP
         FROM (SELECT subject_user_id,round(avg(rating)::numeric,2) AS average,count(*)::int AS count
               FROM reviews WHERE subject_user_id=$1 AND hidden_at IS NULL AND published_at IS NOT NULL GROUP BY subject_user_id) a
         WHERE p.user_id=a.subject_user_id`,
        [subjectId],
      );
      await client.query(
        `INSERT INTO audit_events (actor_user_id,action,target_type,target_id,metadata)
         VALUES ($1,'REVIEW_CREATED','ORDER',$2,jsonb_build_object('subjectUserId',$3))`,
        [authorId, input.orderId, subjectId],
      );
      await client.query("COMMIT");
      return review.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async summary(userId: string): Promise<TrustSummary> {
    const result = await this.pool.query<{
      average: string | null;
      count: number;
      one: number;
      two: number;
      three: number;
      four: number;
      five: number;
    }>(
      `SELECT round(avg(rating)::numeric,2) AS average,count(*)::int AS count,
       count(*) FILTER (WHERE rating=1)::int AS one,count(*) FILTER (WHERE rating=2)::int AS two,
       count(*) FILTER (WHERE rating=3)::int AS three,count(*) FILTER (WHERE rating=4)::int AS four,
       count(*) FILTER (WHERE rating=5)::int AS five
       FROM reviews WHERE subject_user_id=$1 AND hidden_at IS NULL
         AND (published_at IS NOT NULL OR created_at<=CURRENT_TIMESTAMP-INTERVAL '14 days')`,
      [userId],
    );
    const row = result.rows[0]!;
    return {
      userId,
      ratingAverage: row.average === null ? null : Number(row.average),
      ratingCount: row.count,
      ratingBreakdown: {
        "1": row.one,
        "2": row.two,
        "3": row.three,
        "4": row.four,
        "5": row.five,
      },
    };
  }

  async reviews(userId: string) {
    return (
      await this.pool.query(
        `SELECT id,rating,comment,role,created_at AS "createdAt",true AS "verifiedTransaction"
         FROM reviews WHERE subject_user_id=$1 AND hidden_at IS NULL
           AND (published_at IS NOT NULL OR created_at<=CURRENT_TIMESTAMP-INTERVAL '14 days')
         ORDER BY created_at DESC LIMIT 50`,
        [userId],
      )
    ).rows;
  }

  async createReport(reporterId: string, input: ReportInput) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const report = await client.query(
        `INSERT INTO reports (reporter_user_id,target_type,target_id,reason_code,details)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          reporterId,
          input.targetType,
          input.targetId,
          input.reasonCode,
          input.details ?? null,
        ],
      );
      await client.query(
        `INSERT INTO audit_events (actor_user_id,action,target_type,target_id,metadata)
         VALUES ($1,'REPORT_CREATED',$2,$3,jsonb_build_object('reportId',$4,'reasonCode',$5))`,
        [
          reporterId,
          input.targetType,
          input.targetId,
          report.rows[0].id,
          input.reasonCode,
        ],
      );
      await client.query("COMMIT");
      return report.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async queue(status?: string) {
    return (
      await this.pool.query(
        `SELECT id,target_type AS "targetType",target_id AS "targetId",reason_code AS "reasonCode",
          details,status,created_at AS "createdAt"
         FROM reports WHERE ($1::text IS NULL OR status::text=$1) ORDER BY created_at ASC LIMIT 100`,
        [status ?? null],
      )
    ).rows;
  }

  async moderate(
    actorId: string,
    reportId: string,
    decision: string,
    note?: string | null,
  ) {
    const status =
      decision === "DISMISS"
        ? "DISMISSED"
        : decision === "RESOLVE"
          ? "RESOLVED"
          : "IN_REVIEW";
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `WITH changed AS (
         UPDATE reports SET status=$3::"ReportStatus",assigned_user_id=COALESCE(assigned_user_id,$1),
           resolution_note=CASE WHEN $3 IN ('RESOLVED','DISMISSED') THEN $4 ELSE resolution_note END,
           resolved_at=CASE WHEN $3 IN ('RESOLVED','DISMISSED') THEN CURRENT_TIMESTAMP ELSE resolved_at END,
           updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING id)
       INSERT INTO moderation_actions (report_id,actor_user_id,decision,note)
       SELECT id,$1,$5::"ModerationDecision",$4 FROM changed RETURNING id`,
        [actorId, reportId, status, note ?? null, decision],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return false;
      }
      if (["HIDE_REVIEW", "RESTORE_REVIEW"].includes(decision)) {
        await client.query(
          `UPDATE reviews r SET hidden_at=CASE WHEN $2='HIDE_REVIEW' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP
           FROM reports p WHERE p.id=$1 AND p.target_type='REVIEW' AND r.id::text=p.target_id`,
          [reportId, decision],
        );
        await client.query(
          `UPDATE profiles p SET rating_average=a.average,rating_count=a.count,updated_at=CURRENT_TIMESTAMP
           FROM (SELECT u.id AS user_id,round(avg(r.rating)::numeric,2) AS average,count(r.id)::int AS count
                 FROM users u LEFT JOIN reviews r ON r.subject_user_id=u.id AND r.hidden_at IS NULL
                 WHERE u.id=(SELECT rv.subject_user_id FROM reviews rv JOIN reports rp ON rp.target_id=rv.id::text WHERE rp.id=$1)
                 GROUP BY u.id) a WHERE p.user_id=a.user_id`,
          [reportId],
        );
      }
      await client.query(
        `INSERT INTO audit_events (actor_user_id,action,target_type,target_id,metadata)
         VALUES ($1,'REPORT_MODERATED','REPORT',$2,jsonb_build_object('decision',$3))`,
        [actorId, reportId, decision],
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
}
