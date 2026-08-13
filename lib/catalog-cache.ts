'use cache';

import { getDb } from '@/lib/db';
import { products } from '@/lib/schema';
import { eq, like, or, desc, and, count, sql } from 'drizzle-orm';
import { tagProductCatalogue, productCacheProfile } from '@/lib/cache';
import { mapProduct } from '@/lib/product-mapper';
import type { Product } from '@/types';

/**
 * Cached catalogue reads. Lives in its own file because 'use cache' and
 * 'use server' cannot share a file directive. Every function tags its
 * cache entries with 'products' (and a per-row tag where relevant) so
 * Server Actions can invalidate via updateTag.
 *
 * No cookies()/headers()/request-scoped APIs may appear here — cached
 * scopes are prerendered.
 */

export async function getProductsCached({
  page = 1,
  limit = 12,
  category,
  subcategory,
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
  category?: string;
  subcategory?: string;
  featuredOnly?: boolean;
  inStockOnly?: boolean;
  search?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  includeUnpublished?: boolean;
} = {}) {
  tagProductCatalogue();
  productCacheProfile();

  const db = getDb();
  const offset = (page - 1) * limit;

  const conditions = [];
  if (!includeUnpublished) conditions.push(eq(products.status, 'published'));
  if (category) conditions.push(eq(products.category, category as any));
  if (subcategory) conditions.push(eq(products.subcategory, subcategory));
  if (featuredOnly) conditions.push(eq(products.featured, true));
  if (inStockOnly) conditions.push(eq(products.inStock, true));

  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(or(like(products.name, searchPattern), like(products.description, searchPattern)));
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
    items: items.map(mapProduct),
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
  return result ? mapProduct(result) : null;
}

export async function getNewArrivalsCached(limit = 8) {
  tagProductCatalogue();
  productCacheProfile();

  const db = getDb();
  const items = await db
    .select()
    .from(products)
    .where(eq(products.status, 'published'))
    .orderBy(desc(products.publishedAt))
    .limit(limit);

  return items.map(mapProduct);
}

export async function getRelatedCached(currentProductId: string, category: string, limit = 4) {
  tagProductCatalogue();
  productCacheProfile();

  const db = getDb();
  const items = await db
    .select()
    .from(products)
    .where(and(
      eq(products.category, category as any),
      eq(products.status, 'published'),
      sql`${products.id} != ${currentProductId}`
    ))
    .orderBy(desc(products.publishedAt))
    .limit(limit);

  return items.map(mapProduct);
}

export async function getSearchCached(query: string) {
  tagProductCatalogue();
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

  return items.map(mapProduct);
}
