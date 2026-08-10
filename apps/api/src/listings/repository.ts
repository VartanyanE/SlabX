import pg from "pg";
import type {
  Listing,
  ListingInput,
  ListingQuery,
  ListingUpdate,
} from "@slabx/contracts";

export class ListingRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(userId: string, input: ListingInput) {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO listings (seller_user_id,collection_item_id,price_minor,currency,accepts_offers,minimum_offer_minor,condition_disclosure)
       SELECT $1,i.id,$3,$4,$5,$6,$7 FROM collection_items i WHERE i.id=$2 AND i.owner_user_id=$1 AND i.deleted_at IS NULL RETURNING id`,
      [
        userId,
        input.collectionItemId,
        input.priceMinor,
        input.currency,
        input.acceptsOffers,
        input.minimumOfferMinor ?? null,
        input.conditionDisclosure,
      ],
    );
    if (!result.rowCount) return null;
    await this.pool.query(
      `INSERT INTO listing_price_history (listing_id,price_minor) VALUES ($1,$2)`,
      [result.rows[0]!.id, input.priceMinor],
    );
    return this.get(result.rows[0]!.id, userId, true);
  }

  async get(
    id: string,
    userId?: string,
    includePrivate = false,
  ): Promise<Listing | null> {
    const result = await this.pool.query<Listing>(
      `${listingSelect("$2")} WHERE l.id=$1 AND l.deleted_at IS NULL AND (l.status='ACTIVE' OR ($3 AND l.seller_user_id=$2))`,
      [id, userId ?? null, includePrivate],
    );
    return result.rows[0] ?? null;
  }

  async search(query: ListingQuery, userId?: string) {
    const ordering =
      query.sort === "price_asc"
        ? "l.price_minor ASC,l.id"
        : query.sort === "price_desc"
          ? "l.price_minor DESC,l.id"
          : "l.published_at DESC,l.id";
    const rows = (
      await this.pool.query<Listing>(
        `${listingSelect("$9")} WHERE l.status='ACTIVE' AND l.deleted_at IS NULL
         AND ($1::text IS NULL OR lower(c.player_or_character) ILIKE '%'||$1||'%' OR lower(s.name) ILIKE '%'||$1||'%')
         AND ($2::text IS NULL OR cat.slug=$2) AND ($3::bigint IS NULL OR l.price_minor >= $3) AND ($4::bigint IS NULL OR l.price_minor <= $4)
         AND ($5::boolean IS NULL OR (i.condition_type='GRADED')=$5) AND ($6::boolean IS NULL OR l.accepts_offers=$6)
         AND ($7::uuid IS NULL OR l.id > $7) ORDER BY ${ordering} LIMIT $8`,
        [
          query.q?.toLowerCase() ?? null,
          query.category ?? null,
          query.priceMin ?? null,
          query.priceMax ?? null,
          query.graded ?? null,
          query.acceptsOffers ?? null,
          query.cursor ?? null,
          query.limit + 1,
          userId ?? null,
        ],
      )
    ).rows;
    const hasMore = rows.length > query.limit;
    const data = rows.slice(0, query.limit);
    return { data, nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null };
  }

  async mine(userId: string) {
    return (
      await this.pool.query<Listing>(
        `${listingSelect("NULL")} WHERE l.seller_user_id=$1 AND l.deleted_at IS NULL ORDER BY l.created_at DESC`,
        [userId],
      )
    ).rows;
  }

  async update(userId: string, id: string, input: ListingUpdate) {
    const result = await this.pool.query<{ previousPrice: number }>(
      `UPDATE listings SET price_minor=$3,accepts_offers=$4,minimum_offer_minor=$5,condition_disclosure=$6,version=version+1,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND seller_user_id=$2 AND status IN ('DRAFT','PAUSED') AND version=$7 AND deleted_at IS NULL RETURNING price_minor::int AS "previousPrice"`,
      [
        id,
        userId,
        input.priceMinor,
        input.acceptsOffers,
        input.minimumOfferMinor ?? null,
        input.conditionDisclosure,
        input.version,
      ],
    );
    if (!result.rowCount) return null;
    await this.pool.query(
      `INSERT INTO listing_price_history (listing_id,price_minor) VALUES ($1,$2)`,
      [id, input.priceMinor],
    );
    return this.get(id, userId, true);
  }

  async transition(userId: string, id: string, from: string[], to: string) {
    const result = await this.pool.query(
      `UPDATE listings SET status=$4::"ListingStatus",published_at=CASE WHEN $4='ACTIVE' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END,version=version+1,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND seller_user_id=$2 AND status=ANY($3::"ListingStatus"[]) AND deleted_at IS NULL`,
      [id, userId, from, to],
    );
    return Boolean(result.rowCount);
  }

  async watch(userId: string, listingId: string) {
    const result = await this.pool.query(
      `INSERT INTO watchlist_entries (user_id,listing_id) SELECT $1,id FROM listings WHERE id=$2 AND status='ACTIVE' ON CONFLICT DO NOTHING`,
      [userId, listingId],
    );
    return (
      Boolean(result.rowCount) ||
      Boolean(
        (
          await this.pool.query(
            `SELECT 1 FROM watchlist_entries WHERE user_id=$1 AND listing_id=$2`,
            [userId, listingId],
          )
        ).rowCount,
      )
    );
  }
  async unwatch(userId: string, listingId: string) {
    await this.pool.query(
      `DELETE FROM watchlist_entries WHERE user_id=$1 AND listing_id=$2`,
      [userId, listingId],
    );
  }
  async watchlist(userId: string) {
    return (
      await this.pool.query<Listing>(
        `${listingSelect("$1")} JOIN watchlist_entries own_watch ON own_watch.listing_id=l.id AND own_watch.user_id=$1 WHERE l.deleted_at IS NULL ORDER BY own_watch.created_at DESC`,
        [userId],
      )
    ).rows;
  }
}

function listingSelect(watchUserParameter: string) {
  return `SELECT l.id,l.status,l.price_minor::int AS "priceMinor",l.currency,l.accepts_offers AS "acceptsOffers",l.minimum_offer_minor::int AS "minimumOfferMinor",l.condition_disclosure AS "conditionDisclosure",l.published_at::text AS "publishedAt",l.version,
    EXISTS(SELECT 1 FROM watchlist_entries w WHERE w.listing_id=l.id AND w.user_id=${watchUserParameter}) AS watched,
    json_build_object('id',u.id,'handle',p.handle_display,'displayName',p.display_name,'ratingAverage',p.rating_average::float,'ratingCount',p.rating_count) AS seller,
    json_build_object('id',i.id,'catalogCard',json_build_object('id',c.id,'categoryId',cat.id,'categorySlug',cat.slug,'categoryName',cat.name,'cardSetId',s.id,'setName',s.name,'manufacturer',m.name_display,'playerOrCharacter',c.player_or_character,'year',c.year,'cardNumber',c.card_number,'subset',c.subset,'variant',c.variant,'isRookie',c.is_rookie,'status',c.status),'conditionType',i.condition_type,'rawCondition',i.raw_condition,'gradingCompany',CASE WHEN g.id IS NULL THEN NULL ELSE json_build_object('id',g.id,'code',g.code,'name',g.name) END,'grade',i.grade::float,'certificationNumber',i.certification_number,'itemNotes',i.item_notes,'visibility',i.visibility,'availabilityStatus',i.availability_status,'acquiredAt',i.acquired_at::text,'acquisitionPriceMinor',i.acquisition_price_minor,'version',i.version,'media',COALESCE((SELECT json_agg(json_build_object('id',a.id,'publicId',a.public_id,'secureUrl',a.secure_url,'width',a.width,'height',a.height,'format',a.format,'bytes',a.bytes,'position',im.position,'isPrimary',im.is_primary,'moderationStatus',a.moderation_status) ORDER BY im.position) FROM item_media im JOIN media_assets a ON a.id=im.media_asset_id WHERE im.collection_item_id=i.id AND a.deleted_at IS NULL),'[]'::json)) AS item
    FROM listings l JOIN users u ON u.id=l.seller_user_id JOIN profiles p ON p.user_id=u.id JOIN collection_items i ON i.id=l.collection_item_id JOIN catalog_cards c ON c.id=i.catalog_card_id JOIN categories cat ON cat.id=c.category_id JOIN card_sets s ON s.id=c.card_set_id JOIN manufacturers m ON m.id=s.manufacturer_id LEFT JOIN grading_companies g ON g.id=i.grading_company_id`;
}
