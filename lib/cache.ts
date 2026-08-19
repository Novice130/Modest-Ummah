/**
 * Single caching module for the product catalogue.
 *
 * Every cached product read carries cacheTag('products') plus a
 * per-product tag, so a write can invalidate:
 *  - updateTag('products') — everything (create, delete, bulk edits)
 *  - updateTag(`product-${id}`) — one row
 *
 * updateTag is Server-Actions-only (read-your-own-writes, exactly the
 * "publish -> visible on / immediately" acceptance test); Route Handlers
 * (the cron) use revalidateTag instead.
 *
 * If the app ever moves to multiple replicas, this module is the single
 * place a custom cache handler with refreshTags() would plug in.
 */
import { cacheTag, cacheLife } from 'next/cache';

export const PRODUCTS_TAG = 'products';

/**
 * Taxonomy tags. Separate from PRODUCTS_TAG because the nav, filters and
 * category pages read the tree without reading products — renaming a category
 * has to refresh those without dumping the whole catalogue cache. Taxonomy
 * writes invalidate both, since a product's serialized category embeds the name.
 */
export const CATEGORIES_TAG = 'categories';
export const TAGS_TAG = 'tags';

/**
 * The cacheLife profile for catalogue entries. revalidateTag in Next 16
 * requires a profile argument; keep it identical to what the cached reads
 * declare so invalidations land on the right entries.
 */
export const PRODUCT_CACHE_PROFILE: { stale: number; revalidate: number; expire: number } = {
  stale: 300,
  revalidate: 900,
  expire: 86400,
};

export function productTag(id: string): string {
  return `product-${id}`;
}

export function tagProductCatalogue(id?: string) {
  cacheTag(PRODUCTS_TAG);
  if (id) cacheTag(productTag(id));
}

/**
 * Product reads join the taxonomy tables, so they must also carry the taxonomy
 * tags — otherwise a category rename leaves stale names embedded in cached
 * product payloads.
 */
export function tagTaxonomy() {
  cacheTag(CATEGORIES_TAG);
  cacheTag(TAGS_TAG);
}

/**
 * Product reads are revalidated on writes; they can live for days without
 * traffic, but stale entries expire quickly so a missed invalidation
 * self-heals.
 */
export function productCacheProfile() {
  cacheLife(PRODUCT_CACHE_PROFILE);
}
