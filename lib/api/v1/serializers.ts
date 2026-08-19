import type { Product } from '@/types';
import type { CategoryNode, TagRef } from '@/types';

/**
 * Wire shapes for /api/v1.
 *
 * Money is serialized as a STRING throughout. Prices are decimal(10,2) in
 * Postgres; putting them through a JSON float invites a rounding bug in a
 * currency field, and Dart's num would inherit it.
 */

export interface ApiImage {
  url: string;
  alt: string;
  w: number;
  h: number;
  /** base64 data URI, ~24px wide. Empty for images predating imageMeta. */
  lqip: string;
}

export interface ApiProduct {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  price: string;
  compareAtPrice: string | null;
  onSale: boolean;
  sku: string;
  inStock: boolean;
  category: {
    id: string;
    name: string;
    slug: string;
    path: Array<{ id: string; name: string; slug: string }>;
  } | null;
  tags: TagRef[];
  images: ApiImage[];
  featured: boolean;
  createdAt: string;
}

const money = (n: number | undefined | null): string | null =>
  n === undefined || n === null ? null : n.toFixed(2);

/**
 * `onSale` is resolved here rather than left to the client: the sale window
 * lives on the row, and two clients computing it from different clocks would
 * disagree with the price the checkout actually charges.
 */
function isOnSale(product: Product): boolean {
  if (!product.compareAtPrice || product.compareAtPrice <= product.price) return false;
  const now = Date.now();
  if (product.saleStartsAt && new Date(product.saleStartsAt).getTime() > now) return false;
  if (product.saleEndsAt && new Date(product.saleEndsAt).getTime() < now) return false;
  return true;
}

export function serializeProduct(product: Product): ApiProduct {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    price: money(product.price)!,
    compareAtPrice: money(product.compareAtPrice),
    onSale: isOnSale(product),
    sku: product.sku,
    inStock: product.inStock,
    category: product.category,
    tags: product.tags,
    images: (product.images || []).map((url) => {
      const meta = product.imageMeta?.[url];
      return {
        url,
        alt: product.imageAlts?.[url] || product.name,
        // Falls back to the 4:5 the import pipeline produces, so a client can
        // still reserve layout space for an image uploaded through the admin.
        w: meta?.w ?? 1600,
        h: meta?.h ?? 2000,
        lqip: meta?.lqip ?? '',
      };
    }),
    featured: product.featured,
    createdAt: product.created,
  };
}

export interface ApiCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string | null;
  children: ApiCategory[];
}

export function serializeCategory(node: CategoryNode): ApiCategory {
  return {
    id: node.id,
    name: node.name,
    slug: node.slug,
    description: node.description,
    image: node.image,
    children: node.children.map(serializeCategory),
  };
}
