import { getDb } from '@/lib/db';
import { categories, coupons } from '@/lib/schema';
import { and, isNull, lt, or, sql } from 'drizzle-orm';

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
 * Increment usage on payment success. Called from the idempotent webhook.
 * The limit is re-checked in the same statement: two checkouts can both pass
 * evaluateCoupon before either is paid. Returns false when the coupon was
 * already at its limit (or no longer exists), so nothing was counted.
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
