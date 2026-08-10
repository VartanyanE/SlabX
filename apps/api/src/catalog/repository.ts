import pg from "pg";
import type {
  CatalogCard,
  CatalogCardInput,
  CatalogQuery,
  CollectionItem,
  CollectionItemInput,
  CollectionQuery,
} from "@slabx/contracts";

export class CatalogRepository {
  constructor(private readonly pool: pg.Pool) {}

  async categories() {
    return (
      await this.pool.query<{ id: string; slug: string; name: string }>(
        `SELECT id,slug,name FROM categories WHERE active=true ORDER BY sort_order,name`,
      )
    ).rows;
  }
  async gradingCompanies() {
    return (
      await this.pool.query<{
        id: string;
        code: string;
        name: string;
        gradeScale: unknown;
      }>(
        `SELECT id,code,name,grade_scale AS "gradeScale" FROM grading_companies WHERE active=true ORDER BY code`,
      )
    ).rows;
  }
  async cardSets(categoryId?: string) {
    return (
      await this.pool.query<{
        id: string;
        categoryId: string;
        name: string;
        yearStart: number;
        manufacturer: string;
      }>(
        `SELECT s.id,s.category_id AS "categoryId",s.name,s.year_start AS "yearStart",m.name_display AS manufacturer
         FROM card_sets s JOIN manufacturers m ON m.id=s.manufacturer_id
         WHERE ($1::uuid IS NULL OR s.category_id=$1) ORDER BY s.year_start DESC,s.name`,
        [categoryId ?? null],
      )
    ).rows;
  }
  async searchCards(query: CatalogQuery) {
    const rows = (
      await this.pool.query<CatalogCard>(
        `${cardSelect()} WHERE c.deleted_at IS NULL AND c.status='ACTIVE'
         AND ($1::text IS NULL OR c.player_normalized ILIKE '%'||$1||'%' OR lower(s.name) ILIKE '%'||$1||'%' OR lower(c.card_number) ILIKE '%'||$1||'%')
         AND ($2::text IS NULL OR cat.slug=$2) AND ($3::int IS NULL OR c.year=$3)
         AND ($4::uuid IS NULL OR c.id > $4) ORDER BY c.id LIMIT $5`,
        [
          query.q?.toLowerCase() ?? null,
          query.category ?? null,
          query.year ?? null,
          query.cursor ?? null,
          query.limit + 1,
        ],
      )
    ).rows;
    const hasMore = rows.length > query.limit;
    const data = rows.slice(0, query.limit);
    return { data, nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null };
  }
  async getCard(id: string) {
    return (
      (
        await this.pool.query<CatalogCard>(
          `${cardSelect()} WHERE c.id=$1 AND c.deleted_at IS NULL AND c.status IN ('ACTIVE','PENDING_REVIEW')`,
          [id],
        )
      ).rows[0] ?? null
    );
  }
  async createCard(
    userId: string,
    input: CatalogCardInput,
    fingerprint: string,
  ) {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO catalog_cards (category_id,card_set_id,player_or_character,player_normalized,year,card_number,subset,variant,is_rookie,fingerprint,status,created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING_REVIEW',$11) RETURNING id`,
      [
        input.categoryId,
        input.cardSetId,
        input.playerOrCharacter,
        input.playerOrCharacter.toLowerCase(),
        input.year,
        input.cardNumber,
        input.subset ?? null,
        input.variant ?? null,
        input.isRookie,
        fingerprint,
        userId,
      ],
    );
    return this.getCard(result.rows[0]!.id);
  }
  async createItem(userId: string, input: CollectionItemInput) {
    const graded = input.conditionType === "GRADED";
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO collection_items (owner_user_id,catalog_card_id,condition_type,raw_condition,grading_company_id,grade,certification_number,item_notes,visibility,availability_status,acquired_at,acquisition_price_minor)
       VALUES ($1,$2,$3,$4::"RawCondition",$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        userId,
        input.catalogCardId,
        input.conditionType,
        graded ? null : input.rawCondition,
        graded ? input.gradingCompanyId : null,
        graded ? input.grade : null,
        graded ? input.certificationNumber : null,
        input.itemNotes ?? null,
        input.visibility,
        input.availabilityStatus,
        input.acquiredAt ?? null,
        input.acquisitionPriceMinor ?? null,
      ],
    );
    return this.getItem(result.rows[0]!.id, userId);
  }
  async listItems(userId: string, query: CollectionQuery) {
    const rows = (
      await this.pool.query<{ id: string }>(
        `SELECT i.id FROM collection_items i JOIN catalog_cards c ON c.id=i.catalog_card_id
         WHERE i.owner_user_id=$1 AND i.deleted_at IS NULL
         AND ($2::text IS NULL OR c.player_normalized ILIKE '%'||$2||'%')
         AND ($3::"CollectionConditionType" IS NULL OR i.condition_type=$3)
         AND ($4::"CollectionVisibility" IS NULL OR i.visibility=$4)
         AND ($5::uuid IS NULL OR i.id > $5) ORDER BY i.id LIMIT $6`,
        [
          userId,
          query.q?.toLowerCase() ?? null,
          query.conditionType ?? null,
          query.visibility ?? null,
          query.cursor ?? null,
          query.limit + 1,
        ],
      )
    ).rows;
    const hasMore = rows.length > query.limit;
    const ids = rows.slice(0, query.limit).map((row) => row.id);
    const data = await Promise.all(ids.map((id) => this.getItem(id, userId)));
    return {
      data: data.filter((item): item is CollectionItem => Boolean(item)),
      nextCursor: hasMore ? (ids.at(-1) ?? null) : null,
    };
  }
  async getItem(
    id: string,
    requestingUserId?: string,
  ): Promise<CollectionItem | null> {
    const result = await this.pool.query<CollectionItem>(
      `SELECT i.id,
       json_build_object('id',c.id,'categoryId',cat.id,'categorySlug',cat.slug,'categoryName',cat.name,'cardSetId',s.id,'setName',s.name,'manufacturer',m.name_display,'playerOrCharacter',c.player_or_character,'year',c.year,'cardNumber',c.card_number,'subset',c.subset,'variant',c.variant,'isRookie',c.is_rookie,'status',c.status) AS "catalogCard",
       i.condition_type AS "conditionType",i.raw_condition AS "rawCondition",
       CASE WHEN g.id IS NULL THEN NULL ELSE json_build_object('id',g.id,'code',g.code,'name',g.name) END AS "gradingCompany",
       i.grade::float AS grade,i.certification_number AS "certificationNumber",i.item_notes AS "itemNotes",i.visibility,
       i.availability_status AS "availabilityStatus",i.acquired_at::text AS "acquiredAt",i.acquisition_price_minor AS "acquisitionPriceMinor",i.version
       ,COALESCE((SELECT json_agg(json_build_object('id',a.id,'publicId',a.public_id,'secureUrl',a.secure_url,'width',a.width,'height',a.height,'format',a.format,'bytes',a.bytes,'position',im.position,'isPrimary',im.is_primary,'moderationStatus',a.moderation_status) ORDER BY im.position)
         FROM item_media im JOIN media_assets a ON a.id=im.media_asset_id WHERE im.collection_item_id=i.id AND a.deleted_at IS NULL),'[]'::json) AS media
       FROM collection_items i JOIN catalog_cards c ON c.id=i.catalog_card_id JOIN categories cat ON cat.id=c.category_id
       JOIN card_sets s ON s.id=c.card_set_id JOIN manufacturers m ON m.id=s.manufacturer_id
       LEFT JOIN grading_companies g ON g.id=i.grading_company_id
       WHERE i.id=$1 AND i.deleted_at IS NULL AND (i.owner_user_id=$2 OR i.visibility='PUBLIC')`,
      [id, requestingUserId ?? null],
    );
    return result.rows[0] ?? null;
  }
  async updateItem(userId: string, id: string, input: CollectionItemInput) {
    const graded = input.conditionType === "GRADED";
    const result = await this.pool.query(
      `UPDATE collection_items SET catalog_card_id=$3,condition_type=$4,raw_condition=$5::"RawCondition",grading_company_id=$6,grade=$7,certification_number=$8,item_notes=$9,visibility=$10,availability_status=$11,acquired_at=$12,acquisition_price_minor=$13,version=version+1,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND owner_user_id=$2 AND deleted_at IS NULL AND availability_status NOT IN ('RESERVED','SOLD') RETURNING id`,
      [
        id,
        userId,
        input.catalogCardId,
        input.conditionType,
        graded ? null : input.rawCondition,
        graded ? input.gradingCompanyId : null,
        graded ? input.grade : null,
        graded ? input.certificationNumber : null,
        input.itemNotes ?? null,
        input.visibility,
        input.availabilityStatus,
        input.acquiredAt ?? null,
        input.acquisitionPriceMinor ?? null,
      ],
    );
    return result.rowCount ? this.getItem(id, userId) : null;
  }
  async deleteItem(userId: string, id: string) {
    const result = await this.pool.query(
      `UPDATE collection_items SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND owner_user_id=$2 AND deleted_at IS NULL AND availability_status NOT IN ('LISTED','RESERVED','SOLD')`,
      [id, userId],
    );
    return Boolean(result.rowCount);
  }
}

function cardSelect() {
  return `SELECT c.id,c.category_id AS "categoryId",cat.slug AS "categorySlug",cat.name AS "categoryName",c.card_set_id AS "cardSetId",s.name AS "setName",m.name_display AS manufacturer,c.player_or_character AS "playerOrCharacter",c.year,c.card_number AS "cardNumber",c.subset,c.variant,c.is_rookie AS "isRookie",c.status
    FROM catalog_cards c JOIN categories cat ON cat.id=c.category_id JOIN card_sets s ON s.id=c.card_set_id JOIN manufacturers m ON m.id=s.manufacturer_id`;
}
