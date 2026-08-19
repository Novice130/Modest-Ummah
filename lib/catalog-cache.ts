'use cache';

import { getDb } from '@/lib/db';
import { categories, productTags, products, tags } from '@/lib/schema';
import { eq, inArray, like, or, desc, asc, and, count, sql } from 'drizzle-orm';
import { tagProductCatalogue, productCacheProfile, tagTaxonomy } from '@/lib/cache';
import { buildCategoryRef, mapProduct } from '@/lib/product-mapper';
import type { CategoryNode, Product, TagRef } from '@/types';

/**
 * Cached catalogue reads. Lives in its own file because 'use cache' and
 * 'use server' cannot share a file directive. Every function tags its
 * cache entries with 'products' (and a per-row tag where relevant) so
 * Server Actions can invalidate via updateTag.
 *
 * No cookies()/headers()/request-scoped APIs may appear here — cached
 * scopes are prerendered.
 *
 * Category and tags live in their own tables, so every product read has to
 * hydrate them. `hydrate()` below does it in two queries regardless of page
 * size — never per row.
 */

/** Flat category rows, keyed by id, for ancestor-chain walks. */
async function loadCategoryMap() {
  const db = getDb();
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      parentId: categories.parentId,
    })
    .from(categories);
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Attaches category refs and tag lists to a page of product rows.
 * Two queries total: one for the category table, one for the tag joins.
 */
async function hydrate(rows: any[]): Promise<Product[]> {
  if (rows.length === 0) return [];
  const db = getDb();

  const categoryMap = await loadCategoryMap();

  const ids = rows.map((r) => r.id);
  const tagRows = await db
    .select({
      productId: productTags.productId,
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
    })
    .from(productTags)
    .innerJoin(tags, eq(productTags.tagId, tags.id))
    .where(inArray(productTags.productId, ids));

  const byProduct = new Map<string, TagRef[]>();
  for (const t of tagRows) {
    const list = byProduct.get(t.productId) ?? [];
    list.push({ id: t.id, name: t.name, slug: t.slug });
    byProduct.set(t.productId, list);
  }

  return rows.map((r) =>
    mapProduct(r, {
      category: buildCategoryRef(categoryMap, r.categoryId),
      tags: byProduct.get(r.id) ?? [],
    })
  );
}

/**
 * Every category id in the subtree rooted at `slug`, itself included.
 * Products attach to leaves, so /shop/jewellery has to match rings too.
 * Returns [] for an unknown slug, which correctly yields no products.
 */
async function descendantCategoryIds(slug: string): Promise<string[]> {
  const db = getDb();
  const result = await db.execute(sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM categories WHERE slug = ${slug}
      UNION ALL
      SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
    )
    SELECT id FROM subtree
  `);
  const rows = (result as any).rows ?? result;
  return (rows as Array<{ id: string }>).map((r) => r.id);
}

export async function getProductsCached({
  page = 1,
  limit = 12,
  category,
  tag,
  featuredOnly,
  inStockOnly,
  search,
  minPrice,
  maxPrice,
  sort = '-price',
  includeUnpublished = false,
}: {
  page?: number;
  limit?: number;
  /** Category slug. Matches this category and every descendant. */
  category?: string;
  /** Tag slug. */
  tag?: string;
  featuredOnly?: boolean;
  inStockOnly?: boolean;
  search?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  includeUnpublished?: boolean;
} = {}) {
  tagProductCatalogue();
  tagTaxonomy();
  productCacheProfile();

  const db = getDb();
  const offset = (page - 1) * limit;

  const conditions = [];
  if (!includeUnpublished) conditions.push(eq(products.status, 'published'));

  if (category) {
    const ids = await descendantCategoryIds(category);
    // An unknown slug must return nothing, not everything.
    conditions.push(ids.length > 0 ? inArray(products.categoryId, ids) : sql`false`);
  }

  if (tag) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM product_tags pt
      JOIN tags t ON t.id = pt.tag_id
      WHERE pt.product_id = ${products.id} AND t.slug = ${tag}
    )`);
  }

  if (featuredOnly) conditions.push(eq(products.featured, true));
  if (inStockOnly) conditions.push(eq(products.inStock, true));

  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(or(like(products.name, searchPattern), like(products.sku, searchPattern), like(products.description, searchPattern)));
  }

  if (minPrice) {
    conditions.push(sql`CAST(${products.price} AS NUMERIC) >= ${parseFloat(minPrice)}`);
  }
  if (maxPrice) {
    conditions.push(sql`CAST(${products.price} AS NUMERIC) <= ${parseFloat(maxPrice)}`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  let orderBy = desc(products.createdAt);
  if (sort === 'price' || sort === 'price-asc') orderBy = sql`CAST(${products.price} AS NUMERIC) ASC` as any;
  else if (sort === '-price' || sort === 'price-desc') orderBy = sql`CAST(${products.price} AS NUMERIC) DESC` as any;
  else if (sort === 'name') orderBy = sql`${products.name} ASC` as any;
  else if (sort === 'newest') orderBy = desc(products.createdAt);

  const [countResult] = await db.select({ count: count() }).from(products).where(where);
  const items = await db.select().from(products).where(where).orderBy(orderBy).limit(limit).offset(offset);

  return {
    items: await hydrate(items),
    totalItems: countResult?.count || 0,
    totalPages: Math.ceil((countResult?.count || 0) / limit),
    page,
    limit,
  };
}

export async function getProductCached(idOrSlug: string, includeUnpublished = false): Promise<Product | null> {
  productCacheProfile();

  const db = getDb();
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

  const conditions: any[] = [];
  if (!includeUnpublished) conditions.push(eq(products.status, 'published'));

  let result;
  if (isUUID) {
    [result] = await db.select().from(products).where(and(eq(products.id, idOrSlug), ...conditions)).limit(1);
  }
  if (!result) {
    [result] = await db.select().from(products).where(and(eq(products.slug, idOrSlug), ...conditions)).limit(1);
  }

  if (result) tagProductCatalogue(result.id);
  tagTaxonomy();
  if (!result) return null;
  const [hydrated] = await hydrate([result]);
  return hydrated ?? null;
}

export async function getNewArrivalsCached(limit = 8) {
  tagProductCatalogue();
  tagTaxonomy();
  productCacheProfile();

  const db = getDb();
  const items = await db
    .select()
    .from(products)
    .where(and(
      eq(products.status, 'published'),
      eq(products.excludeFromNewArrivals, false)
    ))
    .orderBy(desc(products.newArrivalPinned), desc(products.publishedAt))
    .limit(limit);

  return hydrate(items);
}

/**
 * Siblings under the same category. `categoryId` is the leaf id off the
 * current product; a product with no category has no siblings to show.
 */
export async function getRelatedCached(
  currentProductId: string,
  categoryId: string | null,
  limit = 4
) {
  tagProductCatalogue();
  tagTaxonomy();
  productCacheProfile();

  if (!categoryId) return [];

  const db = getDb();
  const items = await db
    .select()
    .from(products)
    .where(and(
      eq(products.categoryId, categoryId),
      eq(products.status, 'published'),
      sql`${products.id} != ${currentProductId}`
    ))
    .orderBy(desc(products.publishedAt))
    .limit(limit);

  return hydrate(items);
}

export async function getSearchCached(query: string) {
  tagProductCatalogue();
  tagTaxonomy();
  productCacheProfile();

  const db = getDb();
  const searchPattern = `%${query}%`;
  const items = await db
    .select()
    .from(products)
    .where(and(
      eq(products.status, 'published'),
      or(like(products.name, searchPattern), like(products.description, searchPattern))
    ))
    .orderBy(desc(products.publishedAt))
    .limit(20);

  return hydrate(items);
}

/**
 * The editable category tree, root-first, each level ordered by position.
 * Read by the storefront nav, the shop filters and /api/v1/categories.
 */
export async function getCategoryTreeCached(): Promise<CategoryNode[]> {
  tagTaxonomy();
  productCacheProfile();

  const db = getDb();
  const rows = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name));

  const nodes = new Map<string, CategoryNode>();
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id,
      name: r.name,
      slug: r.slug,
      parentId: r.parentId,
      description: r.description ?? '',
      image: r.image,
      position: r.position ?? 0,
      children: [],
    });
  }

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** All tags, for filter UIs and /api/v1/tags. */
export async function getTagsCached(): Promise<TagRef[]> {
  tagTaxonomy();
  productCacheProfile();

  const db = getDb();
  const rows = await db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(tags)
    .orderBy(asc(tags.position), asc(tags.name));
  return rows;
}
