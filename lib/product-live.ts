import { and, eq, or, sql } from 'drizzle-orm';
import { products } from '@/lib/schema';

/**
 * "Live on the storefront": published, or scheduled with a publish time that
 * has passed. Nothing flips scheduled rows on a timer any more (the publish
 * cron kept Neon awake), so every storefront read and checkout applies the
 * schedule itself. published_at is a UTC wall-clock `timestamp` (Drizzle writes
 * toISOString), hence the explicit UTC conversion of now().
 *
 * Cached entries evaluate now() when they are filled, so a scheduled product
 * appears once its entry next revalidates: at most PRODUCT_CACHE_PROFILE
 * .revalidate (15 min) after the publish time. Checkout is uncached, so it can
 * accept a due product slightly before the shop lists it.
 *
 * Lives outside lib/catalog-cache.ts because a 'use cache' file may only
 * export async functions.
 */
export function liveCondition() {
  return or(
    eq(products.status, 'published'),
    and(
      eq(products.status, 'scheduled'),
      sql`${products.publishedAt} <= (now() AT TIME ZONE 'UTC')`
    )
  )!;
}
