'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { products } from '@/lib/schema';
import { eq, like, or, desc, and, count, sql } from 'drizzle-orm';
import type { Product } from '@/types';

/**
 * The homepage is ISR (`export const revalidate = 3600` in app/page.tsx) and
 * /shop/[category] is prerendered via generateStaticParams. Without this,
 * a newly created or edited product stays invisible for up to an hour.
 */
function revalidateProductPaths(slug?: string) {
  revalidatePath('/');
  revalidatePath('/shop');
  if (slug) revalidatePath(`/product/${slug}`);
}

function mapProduct(p: any): Product {
  return {
    id: p.id,
    created: p.createdAt.toISOString(),
    updated: p.updatedAt.toISOString(),
    name: p.name,
    slug: p.slug,
    description: p.description,
    shortDescription: p.shortDescription,
    price: parseFloat(p.price as string),
    compareAtPrice: p.compareAtPrice ? parseFloat(p.compareAtPrice as string) : undefined,
    category: p.category as 'men' | 'women' | 'accessories',
    subcategory: p.subcategory,
    images: (p.images || []) as string[],
    colors: (p.colors || []) as any[],
    sizes: (p.sizes || []) as string[],
    tags: (p.tags || []) as string[],
    featured: p.featured ?? false,
    inStock: p.inStock ?? true,
    stockQuantity: p.stockQuantity ?? 0,
    sku: p.sku,
    weight: p.weight ? parseFloat(p.weight as string) : undefined,
    dimensions: p.dimensions || undefined,
    similarProducts: (p.similarProducts || []) as string[],
    productType: (p.productType as 'simple' | 'variable') || 'simple',
    status: (p.status as 'draft' | 'pending' | 'scheduled' | 'published') || 'published',
    visibility: (p.visibility as 'public' | 'hidden' | 'search_only') || 'public',
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : undefined,
    saleStartsAt: p.saleStartsAt ? p.saleStartsAt.toISOString() : undefined,
    saleEndsAt: p.saleEndsAt ? p.saleEndsAt.toISOString() : undefined,
    manageStock: p.manageStock ?? true,
    backorderPolicy: (p.backorderPolicy as 'no' | 'notify' | 'yes') || 'no',
    lowStockThreshold: p.lowStockThreshold ?? 5,
    shippingClass: p.shippingClass || undefined,
    lengthIn: p.lengthIn ? parseFloat(p.lengthIn as string) : undefined,
    widthIn: p.widthIn ? parseFloat(p.widthIn as string) : undefined,
    heightIn: p.heightIn ? parseFloat(p.heightIn as string) : undefined,
    taxClass: p.taxClass || undefined,
    metaTitle: p.metaTitle || undefined,
    metaDescription: p.metaDescription || undefined,
    ogImage: p.ogImage || undefined,
    upsellIds: (p.upsellIds || []) as string[],
    crossSellIds: (p.crossSellIds || []) as string[],
    imageAlts: (p.imageAlts || {}) as Record<string, string>,
  };
}

export async function fetchProducts({
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
  const db = getDb();
  const offset = (page - 1) * limit;

  const conditions = [];
  // Storefront reads only ever see published products. The admin list
  // passes includeUnpublished to show drafts and scheduled rows.
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
    // In strict sql: price >= minPrice
    conditions.push(sql`CAST(${products.price} AS NUMERIC) >= ${parseFloat(minPrice)}`);
  }
  if (maxPrice) {
    conditions.push(sql`CAST(${products.price} AS NUMERIC) <= ${parseFloat(maxPrice)}`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  
  // Accepts both the internal values ('price', '-price') and the values the
  // shop UI emits ('price-asc', 'price-desc', 'newest'). Anything unrecognised
  // falls back to newest-first.
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

// ─── ADMIN ACTIONS ─────────────────────────────────────────

import { getSession } from './auth.actions';

export async function fetchAllProductsAdmin(page = 1, limit = 50) {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');
  
  return fetchProducts({ page, limit, includeUnpublished: true });
}

export async function createProductAction(data: any) {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();

  // published_at is set at the transition INTO 'published' — never at row
  // creation for drafts.
  const status = data.status || 'draft';
  const publishedAt =
    status === 'published' ? new Date() : null;

  const [created] = await db.insert(products).values({
    name: data.name,
    slug: data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    description: data.description,
    shortDescription: data.shortDescription,
    price: String(data.price),
    compareAtPrice: data.compareAtPrice ? String(data.compareAtPrice) : null,
    category: data.category,
    subcategory: data.subcategory,
    images: typeof data.images === 'string' ? JSON.parse(data.images) : data.images || [],
    colors: typeof data.colors === 'string' ? JSON.parse(data.colors) : data.colors || [],
    sizes: typeof data.sizes === 'string' ? JSON.parse(data.sizes) : data.sizes || [],
    tags: typeof data.tags === 'string' ? JSON.parse(data.tags) : data.tags || [],
    featured: data.featured === true || data.featured === 'true',
    inStock: data.inStock === true || data.inStock === 'true',
    stockQuantity: Number(data.stockQuantity || 0),
    sku: data.sku,
    productType: data.productType || 'simple',
    status,
    publishedAt,
    visibility: data.visibility || 'public',
  }).returning();

  revalidateProductPaths(created.slug);
  return mapProduct(created);
}

export async function updateProductAction(id: string, data: any) {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  
  const updateData: any = { updatedAt: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.slug !== undefined) updateData.slug = data.slug;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.shortDescription !== undefined) updateData.shortDescription = data.shortDescription;
  if (data.price !== undefined) updateData.price = String(data.price);
  if (data.compareAtPrice !== undefined) updateData.compareAtPrice = data.compareAtPrice ? String(data.compareAtPrice) : null;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.subcategory !== undefined) updateData.subcategory = data.subcategory;
  if (data.featured !== undefined) updateData.featured = data.featured === true || data.featured === 'true';
  if (data.inStock !== undefined) updateData.inStock = data.inStock === true || data.inStock === 'true';
  if (data.stockQuantity !== undefined) updateData.stockQuantity = Number(data.stockQuantity);
  if (data.sku !== undefined) updateData.sku = data.sku;
  
  if (data.images !== undefined) updateData.images = typeof data.images === 'string' ? JSON.parse(data.images) : data.images;
  if (data.colors !== undefined) updateData.colors = typeof data.colors === 'string' ? JSON.parse(data.colors) : data.colors;
  if (data.sizes !== undefined) updateData.sizes = typeof data.sizes === 'string' ? JSON.parse(data.sizes) : data.sizes;
  if (data.tags !== undefined) updateData.tags = typeof data.tags === 'string' ? JSON.parse(data.tags) : data.tags;
  if (data.productType !== undefined) updateData.productType = data.productType;
  if (data.visibility !== undefined) updateData.visibility = data.visibility;
  if (data.saleStartsAt !== undefined) updateData.saleStartsAt = data.saleStartsAt ? new Date(data.saleStartsAt) : null;
  if (data.saleEndsAt !== undefined) updateData.saleEndsAt = data.saleEndsAt ? new Date(data.saleEndsAt) : null;
  if (data.manageStock !== undefined) updateData.manageStock = data.manageStock === true || data.manageStock === 'true';
  if (data.backorderPolicy !== undefined) updateData.backorderPolicy = data.backorderPolicy;
  if (data.lowStockThreshold !== undefined) updateData.lowStockThreshold = Number(data.lowStockThreshold);
  if (data.shippingClass !== undefined) updateData.shippingClass = data.shippingClass;
  if (data.lengthIn !== undefined) updateData.lengthIn = data.lengthIn ? String(data.lengthIn) : null;
  if (data.widthIn !== undefined) updateData.widthIn = data.widthIn ? String(data.widthIn) : null;
  if (data.heightIn !== undefined) updateData.heightIn = data.heightIn ? String(data.heightIn) : null;
  if (data.taxClass !== undefined) updateData.taxClass = data.taxClass;
  if (data.metaTitle !== undefined) updateData.metaTitle = data.metaTitle;
  if (data.metaDescription !== undefined) updateData.metaDescription = data.metaDescription;
  if (data.ogImage !== undefined) updateData.ogImage = data.ogImage;
  if (data.upsellIds !== undefined) updateData.upsellIds = typeof data.upsellIds === 'string' ? JSON.parse(data.upsellIds) : data.upsellIds;
  if (data.crossSellIds !== undefined) updateData.crossSellIds = typeof data.crossSellIds === 'string' ? JSON.parse(data.crossSellIds) : data.crossSellIds;
  if (data.imageAlts !== undefined) updateData.imageAlts = typeof data.imageAlts === 'string' ? JSON.parse(data.imageAlts) : data.imageAlts;
  if (data.status !== undefined) {
    updateData.status = data.status;
    // published_at marks the moment of transition into 'published'.
    if (data.status === 'published') {
      updateData.publishedAt = data.publishedAt ? new Date(data.publishedAt) : new Date();
    } else if (data.status === 'scheduled' && data.publishedAt) {
      updateData.publishedAt = new Date(data.publishedAt);
    } else {
      updateData.publishedAt = null;
    }
  }

  const [updated] = await db.update(products).set(updateData).where(eq(products.id, id)).returning();
  if (!updated) throw new Error('Product not found');

  revalidateProductPaths(updated.slug);
  return mapProduct(updated);
}

export async function deleteProductAction(id: string) {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const [deleted] = await db.delete(products).where(eq(products.id, id)).returning();
  if (deleted) revalidateProductPaths(deleted.slug);
  return !!deleted;
}

export async function fetchProductBySlugOrId(idOrSlug: string, includeUnpublished = false): Promise<Product | null> {
  const db = getDb();

  // UUID v4 pattern check — only query by ID if it looks like a UUID
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
  return result ? mapProduct(result) : null;
}

export async function fetchFeaturedProducts(category?: string) {
  return fetchProducts({ page: 1, limit: 8, featuredOnly: true, category, sort: 'newest' });
}

/**
 * New Arrivals: published products ordered by the moment they went live
 * (published_at), not by row creation. A product drafted three weeks ago
 * and published today IS a new arrival today.
 */
export async function fetchNewArrivals(limit = 8) {
  const db = getDb();
  const items = await db
    .select()
    .from(products)
    .where(eq(products.status, 'published'))
    .orderBy(desc(products.publishedAt))
    .limit(limit);

  return items.map(mapProduct);
}

export async function fetchRelatedProducts(currentProductId: string, category: string, limit = 4) {
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

export async function fetchSearchProducts(query: string) {
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
