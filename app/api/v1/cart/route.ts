import { getDb } from '@/lib/db';
import { carts, type CartItemDB } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { json, apiError, requireUser } from '@/lib/api/v1/http';

/**
 * The server cart is a sync target, not the source of truth for pricing.
 * Checkout recomputes every line from the DB (lib/pricing.ts), so a tampered
 * cart body cannot move money — it only changes what the customer sees in
 * their bag across devices.
 */

/** GET /api/v1/cart */
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  const db = getDb();
  const [cart] = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, auth.user.sub))
    .limit(1);

  return json({ items: cart?.items ?? [], updatedAt: cart?.updatedAt?.toISOString() ?? null });
}

/** PUT /api/v1/cart  { items: [...] } — replaces the stored cart. */
export async function PUT(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  try {
    const body = await request.json();
    if (!Array.isArray(body?.items)) {
      return apiError(400, 'items must be an array', 'invalid_body');
    }

    // Cap the payload: an unbounded array here is a cheap way to bloat a row.
    if (body.items.length > 100) {
      return apiError(400, 'Too many items in cart', 'too_many_items');
    }

    const items: CartItemDB[] = body.items.map((item: any) => ({
      productId: String(item.productId),
      variantId: item.variantId ? String(item.variantId) : undefined,
      quantity: Math.max(1, Math.min(99, Number(item.quantity) || 1)),
      color: item.color ? String(item.color) : undefined,
      size: item.size ? String(item.size) : undefined,
    }));

    const db = getDb();
    await db
      .insert(carts)
      .values({ userId: auth.user.sub, items })
      .onConflictDoUpdate({
        target: carts.userId,
        set: { items, updatedAt: new Date() },
      });

    return json({ items });
  } catch (error: any) {
    console.error('PUT /api/v1/cart', error);
    return apiError(500, 'Could not save your bag');
  }
}
