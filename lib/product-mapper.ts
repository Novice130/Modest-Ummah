import type { Product } from '@/types';

/**
 * Maps a raw products row (Drizzle select) to the Product type. Shared by
 * the cached read layer ('use cache') and the write actions ('use server')
 * — neither can import the other, so this lives in a directive-free file.
 */
export function mapProduct(p: any): Product {
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
