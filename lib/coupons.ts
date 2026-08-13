import { getDb } from '@/lib/db';
import { coupons } from '@/lib/schema';
import { ilike, sql } from 'drizzle-orm';

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
    .where(ilike(coupons.code, code.trim()))
    .limit(1);

  if (!coupon) {
    return { ok: false, discount: 0, error: `Coupon "${code.trim()}" does not exist` };
  }

  if (!coupon.enabled) {
    return { ok: false, discount: 0, error: 'This coupon is no longer active' };
  }

  const now = new Date();
  if (coupon.startsAt && new Date(coupon.startsAt) > now) {
    return { ok: false, discount: 0, error: 'This coupon is not active yet' };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) <= now) {
    return { ok: false, discount: 0, error: 'This coupon has expired' };
  }

  if (coupon.usageLimit !== null && coupon.usageLimit !== undefined) {
    if (coupon.usageCount >= coupon.usageLimit) {
      return { ok: false, discount: 0, error: 'This coupon has reached its usage limit' };
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
  } else if (coupon.category) {
    eligible = items.filter((i) => i.category === coupon.category);
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

/** Increment usage on payment success. Called from the idempotent webhook. */
export async function recordCouponUsage(code: string | null | undefined) {
  if (!code) return;
  const db = getDb();
  await db
    .update(coupons)
    .set({ usageCount: sql`${coupons.usageCount} + 1` })
    .where(ilike(coupons.code, code));
}
