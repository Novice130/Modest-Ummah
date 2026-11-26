import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { getCategoryTreeCached, getSitemapProductsCached } from '@/lib/catalog-cache';
import { getSiteUrl } from '@/lib/site-url';
import type { CategoryNode } from '@/types';

const STATIC_PATHS = ['/', '/shop', '/about', '/contact', '/faq', '/shipping', '/returns', '/privacy', '/terms'];

function categorySlugs(nodes: CategoryNode[]): string[] {
  return nodes.flatMap((node) => [node.slug, ...categorySlugs(node.children)]);
}

/**
 * Built when a crawler asks, from the cached catalogue reads. There is no timer
 * behind this, so Neon can suspend between visits, and connection() keeps a list
 * from being frozen at build time. A failed read throws: a 500 makes a crawler
 * retry, whereas a sitemap with no products would read as if they were gone.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();

  const [products, categories] = await Promise.all([
    getSitemapProductsCached(),
    getCategoryTreeCached(),
  ]);
  const base = getSiteUrl();

  return [
    ...STATIC_PATHS.map((path) => ({ url: path === '/' ? base : `${base}${path}` })),
    ...categorySlugs(categories).map((slug) => ({ url: `${base}/shop/${slug}` })),
    ...products.map((product) => ({
      url: `${base}/product/${product.slug}`,
      lastModified: product.updatedAt,
    })),
  ];
}
