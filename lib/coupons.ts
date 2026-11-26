import * as Sentry from '@sentry/nextjs';
import { getDb } from '@/lib/db';
import { categories, coupons, stripeEvents } from '@/lib/schema';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';

/**
 * Coupon evaluation. The single source of truth for discounts — nothing
 * client-supplied is ever trusted. `evaluateCoupon` validates the row
 * against the current time and the resolved line items, then returns the
 * discount amount (or a user-facing error explaining why the code failed).
 */

export interface CouponCheckItem {
  productId: string;
  category: string;
  price: number;
  quantity: number;
}

export interface CouponEvaluation {
  ok: boolean;
  discount: number;
  couponCode?: string;
  error?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Codes are stored upper-case by the admin. Matching is an exact,
 * case-insensitive equality — never ILIKE, where a customer typing "%" or
 * "_" would match (and redeem) an arbitrary coupon.
 */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

function codeEquals(code: string) {
  return sql`upper(${coupons.code}) = ${normalizeCouponCode(code)}`;
}

/**
 * Slugs of the category and every category beneath it. Products attach to
 * leaf categories, so a coupon for "Women" has to cover "Women > Abayas" —
 * the same way the storefront's /shop/women page shows the whole subtree.
 */
async function subtreeSlugs(categoryId: string): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ id: categories.id, slug: categories.slug, parentId: categories.parentId })
    .from(categories);
  const childrenOf = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const list = childrenOf.get(r.parentId) ?? [];
    list.push(r);
    childrenOf.set(r.parentId, list);
  }
  const out = new Set<string>();
  const seen = new Set<string>();
  const stack = rows.filter((r) => r.id === categoryId);
  while (stack.length) {
    const node = stack.pop()!;
    if (seen.has(node.id)) continue; // guards against a parent_id cycle
    seen.add(node.id);
    out.add(node.slug);
    stack.push(...(childrenOf.get(node.id) ?? []));
  }
  return out;
}

const INVALID_COUPON = 'This coupon code is not valid';

export async function evaluateCoupon(
  code: string | null | undefined,
  subtotal: number,
  items: CouponCheckItem[]
): Promise<CouponEvaluation> {
  if (!code || !code.trim()) {
    return { ok: true, discount: 0 };
  }

  const db = getDb();
  const [coupon] = await db
    .select()
    .from(coupons)
    .where(codeEquals(code))
    .limit(1);

  // One message for every reason a code cannot be used, so the answer does
  // not tell a guesser which codes exist.
  const invalid: CouponEvaluation = { ok: false, discount: 0, error: INVALID_COUPON };

  if (!coupon || !coupon.enabled) {
    return invalid;
  }

  const now = new Date();
  if (coupon.startsAt && new Date(coupon.startsAt) > now) {
    return invalid;
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) <= now) {
    return invalid;
  }

  if (coupon.usageLimit !== null && coupon.usageLimit !== undefined) {
    if (coupon.usageCount >= coupon.usageLimit) {
      return invalid;
    }
  }

  const minSpend = coupon.minSpend !== null && coupon.minSpend !== undefined
    ? parseFloat(coupon.minSpend as string)
    : 0;
  if (subtotal < minSpend) {
    return {
      ok: false,
      discount: 0,
      error: `This coupon requires a minimum spend of $${minSpend.toFixed(2)}`,
    };
  }

  // Eligibility is computed against the resolved (server-side) items only.
  let eligible = items;
  const productIds = (coupon.productIds || []).filter(Boolean);
  if (productIds.length > 0) {
    eligible = items.filter((i) => productIds.includes(i.productId));
    if (eligible.length === 0) {
      return {
        ok: false,
        discount: 0,
        error: 'This coupon does not apply to any products in your cart',
      };
    }
  } else if (coupon.categoryId) {
    // The cart carries leaf category slugs; the coupon stores an id. Resolve
    // the id to its whole subtree rather than denormalizing a slug onto the
    // coupon row, which would go stale the moment someone renames it.
    const wanted = await subtreeSlugs(coupon.categoryId);
    eligible = items.filter((i) => i.category && wanted.has(i.category));
    if (eligible.length === 0) {
      return {
        ok: false,
        discount: 0,
        error: 'This coupon does not apply to any products in your cart',
      };
    }
  }

  const eligibleSubtotal = round2(
    eligible.reduce((sum, i) => sum + i.price * i.quantity, 0)
  );

  const amount = parseFloat(coupon.amount as string) || 0;
  const raw =
    coupon.type === 'percentage'
      ? eligibleSubtotal * (amount / 100)
      : Math.min(amount, eligibleSubtotal);

  return {
    ok: true,
    discount: round2(Math.max(0, raw)),
    couponCode: coupon.code,
  };
}

/**
 * Take one use, if the coupon is under its limit. The limit is checked in the
 * same statement, so two checkouts racing for the last use cannot both get
 * it. Returns false when the coupon was already at its limit (or no longer
 * exists), so nothing was counted. Callers go through holdCouponUse.
 */
export async function recordCouponUsage(code: string | null | undefined): Promise<boolean> {
  if (!code) return true;
  const db = getDb();
  const updated = await db
    .update(coupons)
    .set({ usageCount: sql`${coupons.usageCount} + 1`, updatedAt: new Date() })
    .where(
      and(
        codeEquals(code),
        or(isNull(coupons.usageLimit), lt(coupons.usageCount, coupons.usageLimit))
      )
    )
    .returning({ id: coupons.id });
  return updated.length > 0;
}

/**
 * Coupon reservations. A use is taken when the order is created, not when it
 * is paid, so concurrent checkouts cannot overrun a limited coupon. Which
 * orders hold a use is a marker row in the stripe_events ledger (no schema
 * change), keyed by order number: the marker exists exactly while the order
 * holds one use. Taking and giving back a use each claim the marker atomically
 * first (insert ... on conflict do nothing / delete ... returning), so a second
 * release, a retried webhook or a release racing a re-take moves the count
 * once. A crash between the marker and the count leaves it one off, and that is
 * reported, never repeated.
 */
const HOLD_TYPE = 'coupon:held';

export function couponHoldKey(orderId: string): string {
  return `coupon-hold:${orderId}`;
}

/**
 * Make order `orderId` hold one use of `code`. True when it holds one (now or
 * already); false when the coupon is at its limit, in which case no marker is
 * left behind.
 */
export async function holdCouponUse(
  code: string | null | undefined,
  orderId: string
): Promise<boolean> {
  if (!code) return true;
  const db = getDb();
  const key = couponHoldKey(orderId);
  const [claimed] = await db
    .insert(stripeEvents)
    .values({ eventId: key, type: HOLD_TYPE })
    .onConflictDoNothing()
    .returning();
  if (!claimed) return true;

  let counted: boolean;
  try {
    counted = await recordCouponUsage(code);
  } catch (error) {
    await dropMarker(key);
    throw error;
  }
  if (!counted) await dropMarker(key);
  return counted;
}

async function dropMarker(key: string) {
  try {
    await getDb().delete(stripeEvents).where(eq(stripeEvents.eventId, key));
  } catch (error) {
    // Left behind, a later release would give back a use that was never taken.
    console.error('Coupon hold marker not removed; check the coupon use count');
    Sentry.captureException(error, { tags: { step: 'coupon-hold' } });
    throw error;
  }
}

/**
 * Give back the use order `orderId` holds, if it holds one. Safe to call from
 * every path that ends an order (expiry, cancel, full refund, failed
 * checkout): only the caller that removes the marker decrements. Returns true
 * when a use was released.
 */
export async function releaseCouponUse(
  code: string | null | undefined,
  orderId: string
): Promise<boolean> {
  if (!code) return false;
  const db = getDb();
  const removed = await db
    .delete(stripeEvents)
    .where(eq(stripeEvents.eventId, couponHoldKey(orderId)))
    .returning({ eventId: stripeEvents.eventId });
  if (removed.length === 0) return false;
  await db
    .update(coupons)
    .set({ usageCount: sql`GREATEST(${coupons.usageCount} - 1, 0)`, updatedAt: new Date() })
    .where(codeEquals(code));
  return true;
}
