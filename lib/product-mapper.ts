import type { CategoryRef, ImageMeta, Product, TagRef } from '@/types';

/**
 * Maps a raw products row (Drizzle select) to the Product type. Shared by
 * the cached read layer ('use cache') and the write actions ('use server')
 * — neither can import the other, so this lives in a directive-free file.
 *
 * Category and tags live in their own tables now, so they cannot come off the
 * product row. Callers pass them in:
 *   - `category`: the row's own category plus its ancestor chain, root-first
 *   - `tags`: the joined tag rows
 * Both default to empty, which is the correct read for a product whose
 * category was deleted or which carries no tags.
 */
export function mapProduct(
  p: any,
  rels: { category?: CategoryRef | null; tags?: TagRef[] } = {}
): Product {
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
    category: rels.category ?? null,
    images: (p.images || []) as string[],
    colors: (p.colors || []) as any[],
    sizes: (p.sizes || []) as string[],
    tags: rels.tags ?? [],
    featured: p.featured ?? false,
    newArrivalPinned: p.newArrivalPinned ?? false,
    excludeFromNewArrivals: p.excludeFromNewArrivals ?? false,
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
    imageMeta: (p.imageMeta || {}) as Record<string, ImageMeta>,
  };
}

/**
 * Builds a CategoryRef from a flat category list and a leaf id, walking
 * parent_id upward. Returns null when the id is absent — a product whose
 * category was deleted (ON DELETE set null) is a valid state, not an error.
 *
 * The `all` map is expected to hold every category; callers fetch the table
 * once per request rather than issuing a recursive query per product.
 */
export function buildCategoryRef(
  all: Map<string, { id: string; name: string; slug: string; parentId: string | null }>,
  leafId: string | null | undefined
): CategoryRef | null {
  if (!leafId) return null;
  const leaf = all.get(leafId);
  if (!leaf) return null;

  const path: Array<{ id: string; name: string; slug: string }> = [];
  const seen = new Set<string>();
  let cursor: typeof leaf | undefined = leaf;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.unshift({ id: cursor.id, name: cursor.name, slug: cursor.slug });
    cursor = cursor.parentId ? all.get(cursor.parentId) : undefined;
  }

  return { id: leaf.id, name: leaf.name, slug: leaf.slug, path };
}
