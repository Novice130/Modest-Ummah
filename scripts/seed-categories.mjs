import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run with: DATABASE_URL=... node scripts/seed-categories.mjs');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// Mirrors the hardcoded map in lib/utils.ts CATEGORIES so existing products
// keep resolving to the same labels. Root categories exist for the
// products.category enum values; children carry the subcategory strings.
const TREE = [
  {
    name: 'Men',
    slug: 'men',
    children: ['Thobes', 'Kurtas', 'Jubbas', 'Caps/Kufis', 'Pants'],
  },
  {
    name: 'Women',
    slug: 'women',
    children: ['Abayas', 'Hijabs', 'Khimars', 'Jilbabs', 'Dresses'],
  },
  {
    name: 'Accessories',
    slug: 'accessories',
    children: ['Miswak', 'Attar/Perfumes', 'Prayer Mats', 'Tasbeeh', 'Bags'],
  },
];

async function seedCategories() {
  for (const [parentPos, root] of TREE.entries()) {
    const existing = await sql`SELECT id FROM categories WHERE slug = ${root.slug} AND parent_id IS NULL`;
    let rootId;
    if (existing.length > 0) {
      rootId = existing[0].id;
    } else {
      const inserted = await sql`
        INSERT INTO categories (name, slug, parent_id, position, created_at)
        VALUES (${root.name}, ${root.slug}, NULL, ${parentPos}, NOW())
        RETURNING id
      `;
      rootId = inserted[0].id;
    }

    for (const [childPos, child] of root.children.entries()) {
      const childSlug = child.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const childExists = await sql`SELECT id FROM categories WHERE slug = ${childSlug} AND parent_id = ${rootId}`;
      if (childExists.length === 0) {
        await sql`
          INSERT INTO categories (name, slug, parent_id, position, created_at)
          VALUES (${child}, ${childSlug}, ${rootId}, ${childPos}, NOW())
        `;
      }
    }
    console.log(`Seeded ${root.name} (${root.children.length} subcategories)`);
  }
  console.log('Category tree is up to date.');
}

seedCategories()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .then(() => process.exit(0));
