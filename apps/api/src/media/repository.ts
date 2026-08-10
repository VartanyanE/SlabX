import pg from "pg";
import type { CloudinaryResource } from "./cloudinary.js";

export class MediaRepository {
  constructor(private readonly pool: pg.Pool) {}

  async ownsItem(userId: string, itemId: string) {
    const result = await this.pool.query(
      `SELECT 1 FROM collection_items WHERE id=$1 AND owner_user_id=$2 AND deleted_at IS NULL`,
      [itemId, userId],
    );
    return Boolean(result.rowCount);
  }

  async count(itemId: string) {
    const result = await this.pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM item_media WHERE collection_item_id=$1`,
      [itemId],
    );
    return result.rows[0]?.count ?? 0;
  }

  async attach(userId: string, itemId: string, resource: CloudinaryResource) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const position = await client.query<{ position: number }>(
        `SELECT COALESCE(max(position),-1)+1 AS position FROM item_media WHERE collection_item_id=$1`,
        [itemId],
      );
      const asset = await client.query<{ id: string }>(
        `INSERT INTO media_assets (owner_user_id,provider_asset_id,public_id,secure_url,format,width,height,bytes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          userId,
          resource.asset_id,
          resource.public_id,
          resource.secure_url,
          resource.format,
          resource.width,
          resource.height,
          resource.bytes,
        ],
      );
      const index = position.rows[0]?.position ?? 0;
      await client.query(
        `INSERT INTO item_media (collection_item_id,media_asset_id,position,is_primary) VALUES ($1,$2,$3,$4)`,
        [itemId, asset.rows[0]!.id, index, index === 0],
      );
      await client.query("COMMIT");
      return asset.rows[0]!.id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async reorder(userId: string, itemId: string, mediaIds: string[]) {
    if (!(await this.ownsItem(userId, itemId))) return false;
    const existing = await this.pool.query<{ id: string }>(
      `SELECT media_asset_id AS id FROM item_media WHERE collection_item_id=$1 ORDER BY position`,
      [itemId],
    );
    if (
      existing.rows.length !== mediaIds.length ||
      existing.rows.some(({ id }) => !mediaIds.includes(id))
    )
      return false;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE item_media SET position=position+100,is_primary=false WHERE collection_item_id=$1`,
        [itemId],
      );
      for (const [position, id] of mediaIds.entries()) {
        await client.query(
          `UPDATE item_media SET position=$3,is_primary=$4 WHERE collection_item_id=$1 AND media_asset_id=$2`,
          [itemId, id, position, position === 0],
        );
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async remove(userId: string, itemId: string, mediaId: string) {
    const result = await this.pool.query<{ publicId: string }>(
      `UPDATE media_assets a SET deleted_at=CURRENT_TIMESTAMP
       FROM item_media im, collection_items i
       WHERE a.id=$3 AND im.media_asset_id=a.id AND im.collection_item_id=$2 AND i.id=im.collection_item_id
       AND i.owner_user_id=$1 AND i.deleted_at IS NULL RETURNING a.public_id AS "publicId"`,
      [userId, itemId, mediaId],
    );
    if (!result.rowCount) return null;
    await this.pool.query(
      `DELETE FROM item_media WHERE collection_item_id=$1 AND media_asset_id=$2`,
      [itemId, mediaId],
    );
    await this.pool.query(
      `WITH ranked AS (SELECT media_asset_id,row_number() OVER (ORDER BY position)-1 AS next_position FROM item_media WHERE collection_item_id=$1)
       UPDATE item_media im SET position=ranked.next_position,is_primary=(ranked.next_position=0) FROM ranked WHERE im.collection_item_id=$1 AND im.media_asset_id=ranked.media_asset_id`,
      [itemId],
    );
    return result.rows[0]!.publicId;
  }
}
