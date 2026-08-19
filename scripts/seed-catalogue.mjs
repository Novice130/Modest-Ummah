/**
 * Seeds the real Modest Ummah catalogue: the category tree, the tag registry,
 * and the 14 product listings built from the photography in Photos/.
 *
 * Run scripts/import-photos.mjs FIRST — this reads its manifest for image
 * URLs, dimensions and blur placeholders.
 *
 * ─── DESTRUCTIVE ─────────────────────────────────────────────────────────
 * With --reset this DELETEs every existing product and category. That is the
 * intent: the previous catalogue was six demo abayas pointing at a single
 * placeholder image, and the store actually sells jewellery. Orders are
 * unaffected — orders.items is a jsonb snapshot with no FK to products, so
 * order history keeps its full detail.
 *
 * Take a backup first. scripts/backups/ already holds one from 2026-08-19.
 *
 * Idempotent on slug without --reset, so re-running updates in place.
 *
 * Usage:  node --env-file=.env scripts/seed-catalogue.mjs --dry-run
 *         node --env-file=.env scripts/seed-catalogue.mjs
 *         node --env-file=.env scripts/seed-catalogue.mjs --reset
 */

import { readFile } from 'node:fs/promises';

const DRY_RUN = process.argv.includes('--dry-run');
const RESET = process.argv.includes('--reset');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Run with: node --env-file=.env scripts/seed-catalogue.mjs');
  process.exit(1);
}

const parsed = new URL(DATABASE_URL.replace('postgresql://', 'http://'));
const host = parsed.hostname.replace('-pooler.', '.');

/** Neon's HTTP endpoint runs ONE statement per request. Never batch. */
async function q(query, params = []) {
  const res = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': DATABASE_URL.split('&channel_binding')[0],
    },
    body: JSON.stringify({ query, params }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Taxonomy ─────────────────────────────────────────────

const CATEGORY_TREE = [
  {
    name: 'Jewellery',
    slug: 'jewellery',
    position: 0,
    description: 'Cubic zirconia and American-diamond pieces for every day and for the big day.',
    imageKey: '17',
    children: [
      { name: 'Necklace Sets', slug: 'necklace-sets', position: 0, imageKey: '15' },
      { name: 'Bridal Sets', slug: 'bridal-sets', position: 1, imageKey: '07' },
      { name: 'Bracelets', slug: 'bracelets', position: 2, imageKey: '06' },
      { name: 'Bangles & Cuffs', slug: 'bangles-cuffs', position: 3, imageKey: '24' },
      { name: 'Rings', slug: 'rings', position: 4, imageKey: '21' },
      { name: 'Brooches', slug: 'brooches', position: 5, imageKey: '02' },
    ],
  },
  {
    name: 'Apparel',
    slug: 'apparel',
    position: 1,
    description: 'Modest everyday and occasion wear.',
    imageKey: '00',
    children: [{ name: 'Abayas', slug: 'abayas', position: 0, imageKey: '04' }],
  },
];

const TAGS = [
  'Sapphire Blue',
  'Emerald',
  'Rose Gold',
  'Silver',
  'Cubic Zirconia',
  'Bridal',
  'Everyday',
  'Statement',
  'Tennis',
  'Multicolour',
  'Gift',
];

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ─── Products ─────────────────────────────────────────────
//
// `photos` are manifest keys, in display order — the first is the primary
// image. Weight is in pounds and is REQUIRED: the shipping quote engine
// resolves parcel weight from the DB, never from the request body, so a null
// weight breaks checkout.

const PRODUCTS = [
  {
    slug: 'black-embroidered-open-abaya',
    name: 'Black Embroidered Open Abaya',
    category: 'abayas',
    sku: 'MU-ABY-001',
    price: '99.00',
    compareAtPrice: '139.00',
    weight: '1.20',
    dims: { l: '12.00', w: '10.00', h: '2.00' },
    stock: 12,
    tags: ['Everyday', 'Statement'],
    shortDescription:
      'An open-front black abaya with gold and charcoal embroidery running the full length of the placket.',
    description:
      'A softly textured black abaya cut open at the front, with a scrolling gold-and-charcoal embroidered panel running the full length of the placket and repeated across both cuffs. It fastens at the collar with a small gold disc-and-loop tassel. The weight drapes rather than holds its shape, so it layers cleanly over everyday wear and reads formal enough for an occasion. Fully lined sleeves, unlined body.',
    photos: ['00', '04'],
  },
  {
    slug: 'sapphire-cluster-brooch',
    name: 'Sapphire Cluster Brooch',
    category: 'brooches',
    sku: 'MU-JWL-BR-001',
    price: '34.00',
    weight: '0.12',
    stock: 20,
    tags: ['Sapphire Blue', 'Cubic Zirconia', 'Gift'],
    shortDescription:
      'A rhodium-plated fan brooch set with two deep blue stones and a spray of marquise-cut cubic zirconia.',
    description:
      'A curved fan brooch in rhodium plate, set with two deep sapphire-blue oval stones against a spray of marquise and round cubic zirconia. The tiered arcs behind the cluster catch light from several angles at once, so it holds its own on a plain shawl or a hijab. Pin fitting with a rollover safety clasp.',
    photos: ['01', '02'],
  },
  {
    slug: 'multicolour-cz-tennis-bracelet',
    name: 'Multicolour CZ Tennis Bracelet',
    category: 'bracelets',
    sku: 'MU-JWL-BC-001',
    price: '39.00',
    weight: '0.15',
    stock: 18,
    tags: ['Multicolour', 'Cubic Zirconia', 'Tennis', 'Everyday'],
    shortDescription:
      'A rhodium tennis bracelet alternating princess-cut colour stones with pavé clusters.',
    description:
      'A flexible tennis bracelet in rhodium plate, alternating princess-cut stones — peach, green, aquamarine, red, pink, olive and amber — with small pavé cubic zirconia clusters between each one. The colours repeat rather than gradate, so it sits well with almost anything. Box clasp with a safety catch.',
    photos: ['06', '20', '03-left'],
  },
  {
    slug: 'silver-heart-link-bracelet',
    name: 'Silver Heart-Link Bracelet',
    category: 'bracelets',
    sku: 'MU-JWL-BC-002',
    price: '29.00',
    weight: '0.13',
    stock: 15,
    tags: ['Silver', 'Everyday', 'Gift'],
    shortDescription:
      'An openwork bracelet of linked hearts in polished rhodium, graduating toward the centre.',
    description:
      'A bracelet built from openwork heart links in polished rhodium plate, the hearts graduating slightly larger toward the centre and back down again. No stones — the piece works on outline and shadow instead, which keeps it quiet enough for daily wear. Lobster clasp.',
    photos: ['03-right'],
  },
  {
    slug: 'sapphire-leaf-y-necklace-set',
    name: 'Sapphire Leaf Y-Necklace Set',
    category: 'necklace-sets',
    sku: 'MU-JWL-NS-001',
    price: '59.00',
    compareAtPrice: '79.00',
    weight: '0.22',
    stock: 14,
    tags: ['Sapphire Blue', 'Silver', 'Cubic Zirconia', 'Statement'],
    shortDescription:
      'A Y-drop necklace with marquise leaf detailing and sapphire-blue stones, with matching drop earrings.',
    description:
      'A two-piece set in rhodium plate. The necklace runs a pavé chain into a marquise-cut leaf spray, punctuated by three sapphire-blue stones and finished with a pear-cut drop at the point of the Y. The earrings repeat the leaf and pear motif at a smaller scale. Adjustable extender chain, post-and-butterfly earring fittings.',
    photos: ['15', '18', '05'],
  },
  {
    slug: 'sapphire-bridal-bib-necklace-set',
    name: 'Sapphire Bridal Bib Necklace Set',
    category: 'bridal-sets',
    sku: 'MU-JWL-BS-001',
    price: '119.00',
    compareAtPrice: '159.00',
    weight: '0.34',
    stock: 8,
    tags: ['Sapphire Blue', 'Bridal', 'Statement', 'Cubic Zirconia'],
    shortDescription:
      'A wide double-row bib necklace with a square centre stone and teardrop fringe, with statement earrings.',
    description:
      'The largest piece in the collection. A double row of pear-cut sapphire-blue stones, each haloed in pavé cubic zirconia, sweeps into an emerald-cut centre stone with a teardrop fringe hanging below. The matching earrings are built to the same scale, so the set carries a full bridal look on its own. Adjustable slider chain at the back.',
    photos: ['07', '16', '17'],
  },
  {
    slug: 'sapphire-v-necklace-set-maang-tikka',
    name: 'Sapphire V-Necklace Set with Maang Tikka',
    category: 'bridal-sets',
    sku: 'MU-JWL-BS-002',
    price: '109.00',
    weight: '0.30',
    stock: 8,
    tags: ['Sapphire Blue', 'Bridal', 'Cubic Zirconia'],
    shortDescription:
      'A finer single-row V necklace with pear-cut blue stones, matching earrings and a maang tikka.',
    description:
      'A three-piece set: a single-row necklace of pear-cut sapphire-blue stones that angles into a V, an emerald-cut centre with three teardrops beneath it, matching drop earrings, and a maang tikka on its own chain. Lighter through the neckline than the bib set, which makes it the easier of the two to wear with a high or embroidered neckline.',
    photos: ['14'],
  },
  {
    slug: 'silver-oval-cz-necklace-set',
    name: 'Silver Oval CZ Necklace Set',
    category: 'necklace-sets',
    sku: 'MU-JWL-NS-002',
    price: '69.00',
    weight: '0.24',
    stock: 12,
    tags: ['Silver', 'Cubic Zirconia', 'Bridal', 'Statement'],
    shortDescription:
      'A graduated necklace of haloed oval stones in clear cubic zirconia, with matching drop earrings.',
    description:
      'Clear stones only, no colour. Oval cubic zirconia in milgrain-edged halo settings graduate from small at the clasp to a large centre stone with a pear-cut drop below it. The matching earrings stack an oval over a smaller pear. Rhodium plate throughout, with a rolo chain and lobster clasp.',
    photos: ['23', '22', '08'],
  },
  {
    slug: 'emerald-statement-bangle',
    name: 'Emerald Statement Bangle',
    category: 'bangles-cuffs',
    sku: 'MU-JWL-BG-001',
    price: '49.00',
    weight: '0.28',
    stock: 10,
    tags: ['Emerald', 'Silver', 'Statement', 'Cubic Zirconia'],
    shortDescription:
      'A wide hinged bangle in rhodium, banded with baguette and pavé stones around an emerald-cut green centre.',
    description:
      'A wide hinged bangle in rhodium plate. Rows of baguette and pavé cubic zirconia band the whole width, curving in toward an emerald-cut green centre stone in a claw setting. The hinge and box clasp let it open fully, so it goes on without forcing it over the hand.',
    photos: ['09', '10'],
  },
  {
    slug: 'champagne-two-row-cz-bracelet',
    name: 'Champagne Two-Row CZ Bracelet',
    category: 'bracelets',
    sku: 'MU-JWL-BC-003',
    price: '35.00',
    weight: '0.16',
    stock: 16,
    tags: ['Cubic Zirconia', 'Everyday', 'Tennis'],
    shortDescription:
      'A two-row bracelet alternating champagne-gold stones with clear cubic zirconia.',
    description:
      'Two parallel rows of round stones, alternating warm champagne-gold with clear cubic zirconia, set in a flexible link band. The warmth of the gold tone makes it the easiest piece here to wear against gold jewellery rather than silver. Box clasp with a safety catch.',
    photos: ['12'],
  },
  {
    slug: 'silver-clover-tennis-bracelet',
    name: 'Silver Clover Tennis Bracelet',
    category: 'bracelets',
    sku: 'MU-JWL-BC-004',
    price: '32.00',
    weight: '0.14',
    stock: 16,
    tags: ['Silver', 'Tennis', 'Everyday', 'Gift'],
    shortDescription:
      'A fine pavé tennis bracelet interrupted by a single black four-petal clover motif.',
    description:
      'A fine tennis bracelet of small pavé cubic zirconia, interrupted at one point by a single black four-petal clover set flush into the band. The asymmetry is the whole idea — it reads as a plain line bracelet until the motif catches the eye. Rhodium plate, lobster clasp with an extender.',
    photos: ['13'],
  },
  {
    slug: 'rose-gold-marquise-bangle',
    name: 'Rose Gold Marquise Bangle',
    category: 'bangles-cuffs',
    sku: 'MU-JWL-BG-002',
    price: '45.00',
    weight: '0.26',
    stock: 12,
    tags: ['Rose Gold', 'Cubic Zirconia', 'Everyday'],
    shortDescription:
      'A hinged rose-gold bangle with a tapering band of marquise-cut stones across the front.',
    description:
      'A hinged bangle in rose-gold plate. Marquise-cut cubic zirconia lie in overlapping rows across the front, tapering to a plain polished band at the back so it sits flat against the wrist. The narrower of the two rose-gold pieces in the collection, and the one that stacks best.',
    photos: ['19'],
  },
  {
    slug: 'rose-gold-chevron-cuff',
    name: 'Rose Gold Chevron Cuff',
    category: 'bangles-cuffs',
    sku: 'MU-JWL-BG-003',
    price: '55.00',
    weight: '0.32',
    stock: 9,
    tags: ['Rose Gold', 'Cubic Zirconia', 'Statement'],
    shortDescription:
      'A wide rose-gold cuff that drops to a deep V, fully pavé-set with a lattice gallery behind.',
    description:
      'A wide hinged cuff in rose-gold plate that drops to a deep chevron point at the front. The whole face is pavé-set with cubic zirconia, and the band behind is cut into an open lattice so the piece stays light for its size. Sits low on the wrist and needs no other bracelet with it.',
    photos: ['24'],
  },
  {
    slug: 'cz-statement-ring-collection',
    name: 'CZ Statement Ring Collection',
    category: 'rings',
    sku: 'MU-JWL-RG-001',
    price: '24.00',
    weight: '0.08',
    stock: 25,
    tags: ['Cubic Zirconia', 'Rose Gold', 'Silver', 'Statement'],
    shortDescription:
      'Cocktail rings in rhodium, gold and rose-gold plate — domed pavé, floral clusters and open bands.',
    description:
      'A rotating selection of cocktail rings in rhodium, gold and rose-gold plate: domed pavé spheres, floral clusters, openwork bands and solitaire-style settings, most of them adjustable at the shank. Styles vary with stock. Tell us the look you want in the order notes and we will match it as closely as we can from what is in.',
    photos: ['21', '25', '11'],
  },
];

// ─── Runner ───────────────────────────────────────────────

async function main() {
  console.log(`\nCatalogue seed → ${host}${DRY_RUN ? '  (dry run)' : ''}\n`);

  const manifest = JSON.parse(await readFile('scripts/backups/photo-manifest.json', 'utf8'));

  // Fail before touching anything if the photos are not imported.
  const missing = new Set();
  for (const p of PRODUCTS) for (const k of p.photos) if (!manifest[k]) missing.add(k);
  if (missing.size > 0) {
    console.error(
      `Manifest is missing: ${[...missing].join(', ')}\nRun: node scripts/import-photos.mjs`
    );
    process.exit(1);
  }

  const leafSlugs = new Set(CATEGORY_TREE.flatMap((c) => c.children.map((x) => x.slug)));
  for (const p of PRODUCTS) {
    if (!leafSlugs.has(p.category)) {
      console.error(`Product ${p.slug} points at unknown category "${p.category}"`);
      process.exit(1);
    }
  }

  if (DRY_RUN) {
    console.log(`  ${CATEGORY_TREE.length} root categories, ${leafSlugs.size} leaves`);
    console.log(`  ${TAGS.length} tags`);
    console.log(`  ${PRODUCTS.length} products`);
    for (const p of PRODUCTS) {
      console.log(`    ${p.sku.padEnd(16)} ${p.name.padEnd(44)} $${p.price}  ${p.photos.length} photo(s)`);
    }
    console.log('\nDry run complete. Nothing was changed.\n');
    return;
  }

  if (RESET) {
    // product_variants, product_attributes and product_tags all cascade.
    const before = await q('SELECT count(*)::int AS n FROM products');
    await q('DELETE FROM products');
    console.log(`  deleted ${before.rows[0].n} product(s)`);
    await q('DELETE FROM categories');
    console.log('  deleted all categories');
    await q('DELETE FROM tags');
    console.log('  deleted all tags');
  }

  // Categories, parents before children.
  const categoryIds = new Map();
  for (const root of CATEGORY_TREE) {
    const rootRow = await q(
      `INSERT INTO categories (name, slug, parent_id, description, image, position)
       VALUES ($1, $2, NULL, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name, description = EXCLUDED.description,
             image = EXCLUDED.image, position = EXCLUDED.position
       RETURNING id`,
      [root.name, root.slug, root.description ?? '', manifest[root.imageKey]?.square ?? null, root.position]
    );
    const rootId = rootRow.rows[0].id;
    categoryIds.set(root.slug, rootId);

    for (const child of root.children) {
      const childRow = await q(
        `INSERT INTO categories (name, slug, parent_id, description, image, position)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO UPDATE
           SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id,
               image = EXCLUDED.image, position = EXCLUDED.position
         RETURNING id`,
        [child.name, child.slug, rootId, child.description ?? '', manifest[child.imageKey]?.square ?? null, child.position]
      );
      categoryIds.set(child.slug, childRow.rows[0].id);
    }
  }
  console.log(`  ok   ${categoryIds.size} categories`);

  // Tags.
  const tagIds = new Map();
  for (const [i, name] of TAGS.entries()) {
    const row = await q(
      `INSERT INTO tags (name, slug, position)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, position = EXCLUDED.position
       RETURNING id`,
      [name, slugify(name), i]
    );
    tagIds.set(name, row.rows[0].id);
  }
  console.log(`  ok   ${tagIds.size} tags`);

  // Products.
  for (const p of PRODUCTS) {
    const images = p.photos.map((k) => manifest[k].master);
    const imageAlts = {};
    const imageMeta = {};
    for (const k of p.photos) {
      const m = manifest[k];
      imageAlts[m.master] = `${p.name} — product photograph`;
      imageMeta[m.master] = { w: m.w, h: m.h, lqip: m.lqip };
    }

    const row = await q(
      `INSERT INTO products (
         name, slug, description, short_description, price, compare_at_price,
         category_id, images, image_alts, image_meta, sizes, colors,
         featured, in_stock, stock_quantity, sku, weight,
         length_in, width_in, height_in,
         product_type, status, visibility, published_at,
         manage_stock, low_stock_threshold, meta_title, meta_description,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8::jsonb, $9::jsonb, $10::jsonb, '[]'::jsonb, '[]'::jsonb,
         $11, true, $12, $13, $14,
         $15, $16, $17,
         'simple', 'published', 'public', now(),
         true, 3, $18, $19,
         now(), now()
       )
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description,
         short_description = EXCLUDED.short_description,
         price = EXCLUDED.price, compare_at_price = EXCLUDED.compare_at_price,
         category_id = EXCLUDED.category_id,
         images = EXCLUDED.images, image_alts = EXCLUDED.image_alts,
         image_meta = EXCLUDED.image_meta,
         stock_quantity = EXCLUDED.stock_quantity, sku = EXCLUDED.sku,
         weight = EXCLUDED.weight, length_in = EXCLUDED.length_in,
         width_in = EXCLUDED.width_in, height_in = EXCLUDED.height_in,
         meta_title = EXCLUDED.meta_title, meta_description = EXCLUDED.meta_description,
         updated_at = now()
       RETURNING id`,
      [
        p.name,
        p.slug,
        p.description,
        p.shortDescription,
        p.price,
        p.compareAtPrice ?? null,
        categoryIds.get(p.category),
        JSON.stringify(images),
        JSON.stringify(imageAlts),
        JSON.stringify(imageMeta),
        p.featured ?? false,
        p.stock,
        p.sku,
        p.weight,
        p.dims?.l ?? '6.00',
        p.dims?.w ?? '4.00',
        p.dims?.h ?? '2.00',
        `${p.name} | Modest Ummah`,
        p.shortDescription.slice(0, 155),
      ]
    );
    const productId = row.rows[0].id;

    await q('DELETE FROM product_tags WHERE product_id = $1', [productId]);
    for (const tagName of p.tags) {
      const tagId = tagIds.get(tagName);
      if (!tagId) throw new Error(`Product ${p.slug} references unknown tag "${tagName}"`);
      await q(
        'INSERT INTO product_tags (product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [productId, tagId]
      );
    }

    console.log(`  ok   ${p.sku.padEnd(16)} ${p.name}`);
  }

  const counts = await q(
    `SELECT
       (SELECT count(*)::int FROM products)     AS products,
       (SELECT count(*)::int FROM categories)   AS categories,
       (SELECT count(*)::int FROM tags)         AS tags,
       (SELECT count(*)::int FROM product_tags) AS product_tags`
  );
  console.log(`\n${JSON.stringify(counts.rows[0])}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
