import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { products } from '@/lib/schema';
import { and, eq, lte } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { PRODUCTS_TAG, PRODUCT_CACHE_PROFILE } from '@/lib/cache';

/**
 * Flips scheduled -> published when published_at passes. Called by a cron
 * (Dokploy) with a shared secret header. The plan's cache stage will move
 * this to revalidateTag('products'); revalidatePath is correct-but-coarse
 * today.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const now = new Date();

  const due = await db
    .select({ id: products.id, slug: products.slug })
    .from(products)
    .where(
      and(
        eq(products.status, 'scheduled'),
        lte(products.publishedAt, now)
      )
    );

  for (const row of due) {
    await db
      .update(products)
      .set({ status: 'published', updatedAt: now })
      .where(eq(products.id, row.id));
  }

  if (due.length > 0) {
    // Route Handlers cannot call updateTag (Server Actions only);
    // revalidateTag is the correct API here.
    revalidateTag(PRODUCTS_TAG, PRODUCT_CACHE_PROFILE);
  }

  return NextResponse.json({ published: due.length });
}
