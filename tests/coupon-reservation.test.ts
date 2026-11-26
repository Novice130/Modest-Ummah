import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fake: null as any, resolved: null as any }));

vi.mock('drizzle-orm', async (orig) => {
  const actual = await orig<typeof import('drizzle-orm')>();
  const { predicates, comparisonPredicates } = await import('./helpers/fake-predicates');
  return { ...actual, ...predicates, ...comparisonPredicates };
});
vi.mock('@/lib/db', () => ({ getDb: () => h.fake.db }));
vi.mock('@/lib/rate-limit-guards', () => ({ rateLimitRoute: () => null }));
vi.mock('@/lib/auth', () => ({ getAuthFromRequest: async () => null }));
vi.mock('@/lib/session', () => ({
  getSession: async () => ({ id: 'a1', email: 'admin@example.com', name: 'Admin' }),
}));
vi.mock('@/lib/stripe', () => ({ createPaymentIntent: vi.fn() }));
vi.mock('@/lib/pricing', () => ({
  CheckoutRejectedError: class CheckoutRejectedError extends Error {},
  normalizeShippingAddress: (a: any) => a,
  resolveCheckoutOrder: async () => h.resolved,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { POST as checkout } from '@/app/api/checkout/create-payment-intent/route';
import { createPaymentIntent } from '@/lib/stripe';
import { couponHoldKey, holdCouponUse, releaseCouponUse } from '@/lib/coupons';
import { expireStaleUnpaidOrders, UNPAID_ORDER_TTL_MS } from '@/lib/order-expiry';
import { cancelOrderAction } from '@/lib/actions/order.actions';
import { coupons, orderNotes, orders, stripeEvents } from '@/lib/schema';
import { createFakeDb } from './helpers/fake-db';

const address = { firstName: 'Sam', email: 'customer@example.com' };
const resolvedOrder = (couponCode: string | null = 'SAVE') => ({
  items: [{ productId: 'p1', name: 'A', price: 50, quantity: 1 }],
  subtotal: 50,
  discount: couponCode ? 5 : 0,
  couponCode,
  shipping: 0,
  tax: 0,
  total: couponCode ? 45 : 50,
  shippingService: null,
});

let piCounter = 0;
const post = () =>
  checkout(
    new Request('http://x/api/checkout/create-payment-intent', {
      method: 'POST',
      body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }], shippingAddress: address }),
    }) as any
  );

const coupon = () => h.fake.rows(coupons)[0];
const hold = (orderId: string) =>
  h.fake.rows(stripeEvents).some((r: any) => r.eventId === couponHoldKey(orderId));
const seedCoupon = (over: Record<string, any> = {}) =>
  h.fake.seed(coupons, [{ id: 'c1', code: 'SAVE', usageCount: 0, usageLimit: 1, ...over }]);

/** An order as checkout leaves it, holding one use of SAVE. */
function seedHeldOrder(id: string, ageMs: number, over: Record<string, any> = {}) {
  const now = Date.now();
  const order = {
    id: `uuid-${id}`,
    orderId: id,
    email: 'customer@example.com',
    couponCode: 'SAVE',
    status: 'pending_payment',
    paymentStatus: 'pending',
    items: [],
    shippingAddress: {},
    createdAt: new Date(now - ageMs),
    updatedAt: new Date(now - ageMs),
    ...over,
  };
  h.fake.seed(orders, [order]);
  h.fake.seed(stripeEvents, [{ eventId: couponHoldKey(id), type: 'coupon:held', processedAt: new Date() }]);
  coupon().usageCount += 1;
  return order;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.fake = createFakeDb();
  h.resolved = resolvedOrder();
  piCounter = 0;
  vi.mocked(createPaymentIntent).mockImplementation(
    async () => ({ id: `pi_${++piCounter}`, client_secret: 'secret' }) as any
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('checkout reserves the coupon use', () => {
  it('takes the use when the order is created', async () => {
    seedCoupon();
    const res = await post();
    expect(res.status).toBe(200);
    const { orderId } = await res.json();
    expect(coupon().usageCount).toBe(1);
    expect(hold(orderId)).toBe(true);
    expect(h.fake.rows(orders)).toHaveLength(1);
  });

  it('two concurrent checkouts for a limit-1 coupon: exactly one gets it', async () => {
    seedCoupon({ usageLimit: 1 });
    const results = await Promise.all([post(), post()]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(coupon().usageCount).toBe(1);
    // The loser leaves no order, no hold and no PaymentIntent.
    expect(h.fake.rows(orders)).toHaveLength(1);
    expect(h.fake.rows(stripeEvents).filter((r: any) => r.type === 'coupon:held')).toHaveLength(1);
    expect(createPaymentIntent).toHaveBeenCalledTimes(1);
  });

  it('an unlimited coupon is reserved by every checkout', async () => {
    seedCoupon({ usageLimit: null });
    await Promise.all([post(), post(), post()]);
    expect(coupon().usageCount).toBe(3);
  });

  it('gives the use back when the PaymentIntent cannot be created', async () => {
    seedCoupon();
    vi.mocked(createPaymentIntent).mockRejectedValueOnce(new Error('stripe down'));
    expect((await post()).status).toBe(500);
    expect(coupon().usageCount).toBe(0);
    expect(h.fake.rows(orders)[0].status).toBe('cancelled');
    // The next customer can use it.
    expect((await post()).status).toBe(200);
    expect(coupon().usageCount).toBe(1);
  });

  it('no coupon, no reservation', async () => {
    seedCoupon();
    h.resolved = resolvedOrder(null);
    expect((await post()).status).toBe(200);
    expect(coupon().usageCount).toBe(0);
  });
});

describe('lazy expiry of unpaid orders', () => {
  it('a stale unpaid order frees the last use for the next checkout', async () => {
    seedCoupon({ usageLimit: 1 });
    const stale = seedHeldOrder('OLD-1', UNPAID_ORDER_TTL_MS + 60_000);
    expect(coupon().usageCount).toBe(1);

    const res = await post();
    expect(res.status).toBe(200);
    expect(stale.status).toBe('cancelled');
    expect(stale.paymentStatus).toBe('pending');
    expect(hold('OLD-1')).toBe(false);
    expect(coupon().usageCount).toBe(1); // released by OLD-1, taken by the new order
    expect(h.fake.rows(orderNotes).filter((n: any) => n.orderId === stale.id)).toHaveLength(1);
  });

  it('leaves recent, paid and failed-but-recent orders alone; expires stale failed ones', async () => {
    seedCoupon({ usageLimit: null });
    const recent = seedHeldOrder('NEW', 5 * 60_000);
    const paid = seedHeldOrder('PAID', 3 * UNPAID_ORDER_TTL_MS, { paymentStatus: 'paid', status: 'processing' });
    const failed = seedHeldOrder('FAILED', 2 * UNPAID_ORDER_TTL_MS, { paymentStatus: 'failed' });
    expect(await expireStaleUnpaidOrders()).toBe(1);
    expect(recent.status).toBe('pending_payment');
    expect(paid.status).toBe('processing');
    expect(failed.status).toBe('cancelled');
    expect(coupon().usageCount).toBe(2);
  });

  it('is idempotent and safe when two requests expire at once', async () => {
    seedCoupon({ usageLimit: null });
    seedHeldOrder('OLD-1', 2 * UNPAID_ORDER_TTL_MS);
    seedHeldOrder('OLD-2', 2 * UNPAID_ORDER_TTL_MS);
    const counts = await Promise.all([expireStaleUnpaidOrders(), expireStaleUnpaidOrders()]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(2);
    await expireStaleUnpaidOrders();
    expect(coupon().usageCount).toBe(0);
    expect(h.fake.rows(orderNotes)).toHaveLength(2);
  });

  it('an order the admin already cancelled is not released twice', async () => {
    seedCoupon({ usageLimit: null });
    const order = seedHeldOrder('OLD-1', 2 * UNPAID_ORDER_TTL_MS);
    await cancelOrderAction('OLD-1');
    expect(order.status).toBe('cancelled');
    expect(coupon().usageCount).toBe(0);
    expect(await expireStaleUnpaidOrders()).toBe(0);
    expect(coupon().usageCount).toBe(0);
  });

  it('an expiry failure never blocks a checkout', async () => {
    seedCoupon();
    h.fake.failNext('orders', 'update');
    expect((await post()).status).toBe(200);
  });
});

describe('hold and release primitives', () => {
  it('release is exactly once, even concurrently, and only for a held use', async () => {
    seedCoupon({ usageLimit: null });
    seedHeldOrder('A', 0);
    const released = await Promise.all([releaseCouponUse('SAVE', 'A'), releaseCouponUse('SAVE', 'A')]);
    expect(released.filter(Boolean)).toHaveLength(1);
    expect(coupon().usageCount).toBe(0);
    expect(await releaseCouponUse('SAVE', 'NEVER-HELD')).toBe(false);
    expect(coupon().usageCount).toBe(0);
  });

  it('hold is a no-op for an order already holding a use', async () => {
    seedCoupon({ usageLimit: null });
    expect(await holdCouponUse('SAVE', 'A')).toBe(true);
    expect(await holdCouponUse('SAVE', 'A')).toBe(true);
    expect(coupon().usageCount).toBe(1);
  });

  it('a refused hold leaves no marker, so a later release cannot undercount', async () => {
    seedCoupon({ usageLimit: 1, usageCount: 1 });
    expect(await holdCouponUse('SAVE', 'B')).toBe(false);
    expect(hold('B')).toBe(false);
    expect(await releaseCouponUse('SAVE', 'B')).toBe(false);
    expect(coupon().usageCount).toBe(1);
  });

  it('a failed count write gives the marker back and rethrows', async () => {
    seedCoupon({ usageLimit: null });
    h.fake.failNext('coupons', 'update');
    await expect(holdCouponUse('SAVE', 'C')).rejects.toThrow();
    expect(hold('C')).toBe(false);
    expect(coupon().usageCount).toBe(0);
  });
});
