'use server';

import { updateTag } from 'next/cache';
import { getDb } from '@/lib/db';
import { products } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { PRODUCTS_TAG, productTag } from '@/lib/cache';
import { mapProduct } from '@/lib/product-mapper';
import {
  getProductsCached,
  getProductCached,
  getNewArrivalsCached,
  getRelatedCached,
  getSearchCached,
} from '@/lib/catalog-cache';
import type { Product } from '@/types';
import { getSession } from './auth.actions';

/**
 * Writes invalidate via updateTag — read-your-own-writes. The cached reads
 * in lib/catalog-cache.ts all carry the 'products' tag (plus per-row tags),
 * so a publish is visible on the next render with no manual restart.
 */
function invalidateProductCaches(id?: string) {
  updateTag(PRODUCTS_TAG);
  if (id) updateTag(productTag(id));
}

export async function fetchProducts(params?: Parameters<typeof getProductsCached>[0]) {
  return getProductsCached(params);
}

export async function fetchProductBySlugOrId(idOrSlug: string, includeUnpublished = false): Promise<Product | null> {
  return getProductCached(idOrSlug, includeUnpublished);
}

export async function fetchFeaturedProducts(category?: string) {
  const result = await getProductsCached({ page: 1, limit: 8, featuredOnly: true, category, sort: 'newest' });
  return result;
}

export async function fetchNewArrivals(limit = 8) {
  return getNewArrivalsCached(limit);
}

export async function fetchRelatedProducts(currentProductId: string, category: string, limit = 4) {
  return getRelatedCached(currentProductId, category, limit);
}

export async function fetchSearchProducts(query: string) {
  return getSearchCached(query);
}

// ─── ADMIN ACTIONS ─────────────────────────────────────────

export async function fetchAllProductsAdmin(page = 1, limit = 50) {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  return getProductsCached({ page, limit, includeUnpublished: true });
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

  invalidateProductCaches(created.id);
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

  invalidateProductCaches(updated.id);
  return mapProduct(updated);
}

export async function deleteProductAction(id: string) {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const [deleted] = await db.delete(products).where(eq(products.id, id)).returning();
  if (deleted) invalidateProductCaches(deleted.id);
  return !!deleted;
}
