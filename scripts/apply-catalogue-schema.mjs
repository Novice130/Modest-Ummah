/**
 * Apply the catalogue taxonomy schema to Neon.
 *
 * Turns categories and tags into real, editable data:
 *   - products.category_id  → FK onto the (already hierarchical) categories table
 *   - tags + product_tags   → a tag registry with a join, replacing products.tags jsonb
 *   - products.image_meta   → intrinsic dimensions + LQIP, keyed by image URL
 *   - coupons.category_id   → FK, replacing the free-text coupons.category
 *
 * Additive and idempotent by default: every statement is guarded with
 * IF NOT EXISTS or a duplicate-object catch, so re-running is a no-op.
 *
 * The DROP statements that retire the replaced columns are gated behind
 * --drop, and are irreversible. Run without it first, migrate the data, then
 * re-run with it.
 *
 * Deliberately NOT scripts/push-schema.mjs — that one begins with DROP TABLE
 * and would destroy the store.
 *
 * Neon's HTTP /sql endpoint runs ONE statement per request — never put two
 * semicolon-separated statements in a single step, it fails with 42601.
 *
 * Usage:  node scripts/apply-catalogue-schema.mjs
 *         node scripts/apply-catalogue-schema.mjs --dry-run
 *         node scripts/apply-catalogue-schema.mjs --drop
 */

const DRY_RUN = process.argv.includes('--dry-run');
const DO_DROP = process.argv.includes('--drop');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Load your .env first.');
  process.exit(1);
}

const parsed = new URL(DATABASE_URL.replace('postgresql://', 'http://'));
const host = parsed.hostname.replace('-pooler.', '.'); // non-pooler for DDL

async function query(sql) {
  const res = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': DATABASE_URL.split('&channel_binding')[0],
    },
    body: JSON.stringify({ query: sql, params: [] }),
  });
  if (!res.ok) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const steps = [
  // ─── categories ───────────────────────────────────────
  // Already created by the connector migration, but this script has to stand
  // on its own against a database that never ran it.
  [
    'table categories',
    `CREATE TABLE IF NOT EXISTS "categories" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
       "name" text NOT NULL,
       "slug" text NOT NULL,
       "parent_id" uuid,
       "description" text DEFAULT '',
       "image" text,
       "position" integer DEFAULT 0,
       "created_at" timestamp DEFAULT now() NOT NULL
     )`,
  ],
  [
    'fk categories.parent_id',
    `DO $$ BEGIN
       ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk"
         FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE cascade;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  ],
  [
    'index categories.slug',
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_categories_slug" ON "categories" ("slug")`,
  ],
  [
    'index categories.parent_id',
    `CREATE INDEX IF NOT EXISTS "idx_categories_parent" ON "categories" ("parent_id")`,
  ],

  // ─── tags registry ────────────────────────────────────
  [
    'table tags',
    `CREATE TABLE IF NOT EXISTS "tags" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
       "name" text NOT NULL,
       "slug" text NOT NULL,
       "position" integer DEFAULT 0,
       "created_at" timestamp DEFAULT now() NOT NULL
     )`,
  ],
  [
    'index tags.slug',
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_tags_slug" ON "tags" ("slug")`,
  ],
  [
    'table product_tags',
    `CREATE TABLE IF NOT EXISTS "product_tags" (
       "product_id" uuid NOT NULL,
       "tag_id" uuid NOT NULL,
       CONSTRAINT "product_tags_product_id_tag_id_pk" PRIMARY KEY ("product_id", "tag_id")
     )`,
  ],
  [
    'fk product_tags.product_id',
    `DO $$ BEGIN
       ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_product_id_products_id_fk"
         FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE cascade;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  ],
  [
    'fk product_tags.tag_id',
    `DO $$ BEGIN
       ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_tag_id_tags_id_fk"
         FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE cascade;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  ],
  [
    'index product_tags.tag_id',
    `CREATE INDEX IF NOT EXISTS "idx_product_tags_tag" ON "product_tags" ("tag_id")`,
  ],

  // ─── products ─────────────────────────────────────────
  [
    'column products.category_id',
    `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category_id" uuid`,
  ],
  [
    'fk products.category_id',
    `DO $$ BEGIN
       ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk"
         FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE set null;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  ],
  [
    'column products.image_meta',
    `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "image_meta" jsonb DEFAULT '{}'::jsonb`,
  ],

  // ─── coupons ──────────────────────────────────────────
  [
    'column coupons.category_id',
    `ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "category_id" uuid`,
  ],
  [
    'fk coupons.category_id',
    `DO $$ BEGIN
       ALTER TABLE "coupons" ADD CONSTRAINT "coupons_category_id_categories_id_fk"
         FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE set null;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  ],

  // ─── index swap ───────────────────────────────────────
  // The old index was on the enum column; point it at the FK.
  [
    'drop old index products.category',
    `DROP INDEX IF EXISTS "idx_products_category"`,
  ],
  [
    'index products.category_id',
    `CREATE INDEX IF NOT EXISTS "idx_products_category" ON "products" ("category_id")`,
  ],
];

// Irreversible. Only runs under --drop, after the data has moved across.
const dropSteps = [
  [
    'drop products.category',
    `ALTER TABLE "products" DROP COLUMN IF EXISTS "category"`,
  ],
  [
    'drop products.subcategory',
    `ALTER TABLE "products" DROP COLUMN IF EXISTS "subcategory"`,
  ],
  [
    'drop products.tags',
    `ALTER TABLE "products" DROP COLUMN IF EXISTS "tags"`,
  ],
  [
    'drop coupons.category',
    `ALTER TABLE "coupons" DROP COLUMN IF EXISTS "category"`,
  ],
  [
    'drop type category',
    `DROP TYPE IF EXISTS "category"`,
  ],
];

async function main() {
  console.log(
    `\nCatalogue taxonomy schema → ${host}${DRY_RUN ? '  (dry run)' : ''}\n`
  );

  const all = DO_DROP ? [...steps, ...dropSteps] : steps;
  if (DO_DROP && !DRY_RUN) {
    console.log('  --drop given: replaced columns will be REMOVED.\n');
  }

  for (const [label, sql] of all) {
    if (DRY_RUN) {
      console.log(`  would apply: ${label}`);
      continue;
    }
    try {
      await query(sql);
      console.log(`  ok   ${label}`);
    } catch (error) {
      console.error(`  FAIL ${label}: ${error.message}`);
      process.exit(1);
    }
  }

  if (!DO_DROP && !DRY_RUN) {
    console.log(
      '\nAdditive pass done. Re-run with --drop once products carry category_id\n' +
      'and product_tags rows, to retire category/subcategory/tags.'
    );
  }
  console.log(
    DRY_RUN ? '\nDry run complete. Nothing was changed.\n' : '\nSchema applied.\n'
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
