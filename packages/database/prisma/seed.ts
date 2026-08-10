import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query(
    `INSERT INTO system_metadata (key, value, updated_at)
     VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
    ["seed", JSON.stringify({ version: 1, environment: "development" })],
  );
  await client.query(`
    INSERT INTO categories (id,slug,name,kind,sort_order) VALUES
      ('10000000-0000-4000-8000-000000000001','basketball','Basketball','SPORT',1),
      ('10000000-0000-4000-8000-000000000002','baseball','Baseball','SPORT',2),
      ('10000000-0000-4000-8000-000000000003','football','Football','SPORT',3),
      ('10000000-0000-4000-8000-000000000004','pokemon','Pokémon','TCG',4)
    ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, active=true;
    INSERT INTO manufacturers (id,name_normalized,name_display) VALUES
      ('20000000-0000-4000-8000-000000000001','panini','Panini'),
      ('20000000-0000-4000-8000-000000000002','topps','Topps'),
      ('20000000-0000-4000-8000-000000000003','pokemon','The Pokémon Company')
    ON CONFLICT (name_normalized) DO UPDATE SET name_display=EXCLUDED.name_display;
    INSERT INTO card_sets (id,category_id,manufacturer_id,name,name_normalized,year_start) VALUES
      ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Prizm','prizm',2023),
      ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Chrome','chrome',2024),
      ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Donruss','donruss',2023),
      ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000003','Scarlet & Violet—151','scarlet violet 151',2023)
    ON CONFLICT (category_id,manufacturer_id,name_normalized,year_start) DO UPDATE SET name=EXCLUDED.name;
    INSERT INTO catalog_cards (category_id,card_set_id,player_or_character,player_normalized,year,card_number,variant,is_rookie,fingerprint,status) VALUES
      ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Victor Wembanyama','victor wembanyama',2023,'136','Silver',true,'basketball|2023|prizm|136|victor wembanyama|silver','ACTIVE'),
      ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','LeBron James','lebron james',2023,'1',NULL,false,'basketball|2023|prizm|1|lebron james|','ACTIVE'),
      ('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','Shohei Ohtani','shohei ohtani',2024,'1','Refractor',false,'baseball|2024|chrome|1|shohei ohtani|refractor','ACTIVE'),
      ('10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','C.J. Stroud','c j stroud',2023,'339','Rated Rookie',true,'football|2023|donruss|339|c j stroud|rated rookie','ACTIVE'),
      ('10000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004','Charizard ex','charizard ex',2023,'199/165','Special Illustration Rare',false,'pokemon|2023|151|199/165|charizard ex|sir','ACTIVE'),
      ('10000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004','Pikachu','pikachu',2023,'173/165','Illustration Rare',false,'pokemon|2023|151|173/165|pikachu|ir','ACTIVE')
    ON CONFLICT (fingerprint) DO NOTHING;
    INSERT INTO grading_companies (code,name,grade_scale,cert_verification_url_template) VALUES
      ('PSA','Professional Sports Authenticator','{"min":1,"max":10,"step":1}','https://www.psacard.com/cert/{cert}'),
      ('BGS','Beckett Grading Services','{"min":1,"max":10,"step":0.5}','https://www.beckett.com/grading/card-lookup?item_type=BGS&item_id={cert}'),
      ('CGC','Certified Guaranty Company','{"min":1,"max":10,"step":0.5}','https://www.cgccards.com/certlookup/{cert}/'),
      ('SGC','Sportscard Guaranty','{"min":1,"max":10,"step":0.5}',NULL)
    ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, active=true;
  `);
} finally {
  await client.end();
}
