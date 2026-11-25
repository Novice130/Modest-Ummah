import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fake: null as any, event: null as any }));

vi.mock('drizzle-orm', async (orig) => {
  const actual = await orig<typeof import('drizzle-orm')>();
  const { predicates } = await import('./helpers/fake-predicates');
  return { ...actual, ...predicates };
});
vi.mock('@/lib/db', () => ({ getDb: () => h.fake.db }));
vi.mock('next/headers', () => ({
  headers: async () => new Map([['stripe-signature', 'sig']]),
}));
vi.mock('@/lib/stripe', () => ({ verifyWebhookSignature: () => h.event }));
vi.mock('@/lib/email', () => ({
  sendOrderConfirmation: vi.fn(),
  sendNewOrderAlert: vi.fn(),
}));
vi.mock('@/lib/inventory', () => ({ decrementStock: vi.fn(), restock: vi.fn() }));
vi.mock('@/lib/coupons', () => ({
  normalizeCouponCode: (c: string) => c.toUpperCase(),
  recordCouponUsage: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import * as Sentry from '@sentry/nextjs';
import { POST } from '@/app/api/webhooks/stripe/route';
import { sendNewOrderAlert, sendOrderConfirmation } from '@/lib/email';
import { decrementStock, restock } from '@/lib/inventory';
import { recordCouponUsage } from '@/lib/coupons';
import { orders, orderNotes, settings, stripeEvents } from '@/lib/schema';
import { createFakeDb } from './helpers/fake-db';

const items = [
  { productId: 'p1', name: 'A', price: 10, quantity: 1 },
  { productId: 'p2', name: 'B', price: 20, quantity: 2 },
];

function seedOrder(over: Record<string, any> = {}) {
  const order = {
    id: 'o1',
    orderId: 'MU-1',
    email: 'customer@example.com',
    userId: null,
    couponCode: 'SAVE',
    status: 'pending_payment',
    paymentStatus: 'pending',
    paymentIntentId: 'pi_1',
    items,
    shippingAddress: { firstName: 'Sam' },
    subtotal: '50',
    shipping: '0',
    tax: '0',
    total: '50',
    ...over,
  };
  h.fake.seed(orders, [order]);
  return order;
}

const succeeded = (id = 'evt_1', piOver: Record<string, any> = {}) => ({
  id,
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id: 'pi_1',
      amount: 5000,
      currency: 'usd',
      metadata: { orderId: 'MU-1' },
      ...piOver,
    },
  },
});
const refunded = (id = 'evt_r', full = true) => ({
  id,
  type: 'charge.refunded',
  data: { object: { id: 'ch_1', payment_intent: 'pi_1', refunded: full, amount_refunded: 5000 } },
});

const deliver = (event: any) => {
  h.event = event;
  return POST(new Request('http://x', { method: 'POST', body: '{}' }) as any);
};
const isMarked = (id: string) =>
  h.fake.rows(stripeEvents).some((r: any) => r.eventId === id);

beforeEach(() => {
  vi.clearAllMocks();
  h.fake = createFakeDb();
  vi.mocked(sendOrderConfirmation).mockResolvedValue({ success: true });
  vi.mocked(sendNewOrderAlert).mockResolvedValue({ success: true });
  vi.mocked(decrementStock).mockResolvedValue(undefined);
  vi.mocked(restock).mockResolvedValue(undefined);
  vi.mocked(recordCouponUsage).mockResolvedValue(true);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('payment_intent.succeeded', () => {
  it('marks paid, runs each side effect once and records the event', async () => {
    const order = seedOrder();
    const res = await deliver(succeeded());
    expect(res.status).toBe(200);
    expect(order.paymentStatus).toBe('paid');
    expect(order.status).toBe('processing');
    expect(decrementStock).toHaveBeenCalledTimes(2);
    expect(recordCouponUsage).toHaveBeenCalledTimes(1);
    expect(sendOrderConfirmation).toHaveBeenCalledTimes(1);
    expect(isMarked('evt_1')).toBe(true);
  });

  it('returns non-2xx on a DB failure, then a retry really processes', async () => {
    const order = seedOrder();
    h.fake.failNext('orders', 'update');
    const res = await deliver(succeeded());
    expect(res.status).toBe(500);
    expect(order.paymentStatus).toBe('pending');
    expect(isMarked('evt_1')).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    expect((await deliver(succeeded())).status).toBe(200);
    expect(order.paymentStatus).toBe('paid');
    expect(isMarked('evt_1')).toBe(true);
  });

  it('a retry after a partial failure repeats nothing that already succeeded', async () => {
    seedOrder();
    vi.mocked(decrementStock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('stock write failed'));
    expect((await deliver(succeeded())).status).toBe(500);
    expect(recordCouponUsage).not.toHaveBeenCalled();
    expect(sendOrderConfirmation).not.toHaveBeenCalled();

    expect((await deliver(succeeded())).status).toBe(200);
    const lines = vi.mocked(decrementStock).mock.calls.map((c) => c[0][0].productId);
    expect(lines).toEqual(['p1', 'p2', 'p2']);
    expect(recordCouponUsage).toHaveBeenCalledTimes(1);
    expect(sendOrderConfirmation).toHaveBeenCalledTimes(1);
  });

  it('a retry after recording the event failed repeats no side effect', async () => {
    seedOrder();
    // First insert into stripe_events that fails is the first step claim, so
    // fail the marker itself by making every claim succeed first.
    const realInsert = h.fake.db.insert;
    let failMark = true;
    h.fake.db.insert = (table: any) => {
      const builder = realInsert(table);
      return {
        values: (v: any) => {
          if (v.eventId === 'evt_1' && failMark) {
            failMark = false;
            throw new Error('mark failed');
          }
          return builder.values(v);
        },
      };
    };
    expect((await deliver(succeeded())).status).toBe(500);
    expect((await deliver(succeeded())).status).toBe(200);
    expect(decrementStock).toHaveBeenCalledTimes(2);
    expect(recordCouponUsage).toHaveBeenCalledTimes(1);
    expect(sendOrderConfirmation).toHaveBeenCalledTimes(1);
  });

  it('skips an event already handled', async () => {
    seedOrder();
    await deliver(succeeded());
    vi.mocked(decrementStock).mockClear();
    vi.mocked(sendOrderConfirmation).mockClear();
    expect((await deliver(succeeded())).status).toBe(200);
    expect(decrementStock).not.toHaveBeenCalled();
    expect(sendOrderConfirmation).not.toHaveBeenCalled();
  });

  it('a new event id for the same payment still cannot double count', async () => {
    seedOrder();
    await deliver(succeeded('evt_1'));
    await deliver(succeeded('evt_2'));
    expect(decrementStock).toHaveBeenCalledTimes(2);
    expect(recordCouponUsage).toHaveBeenCalledTimes(1);
    expect(sendOrderConfirmation).toHaveBeenCalledTimes(1);
  });

  it('answers 503 while another delivery holds a step', async () => {
    seedOrder();
    h.fake.seed(stripeEvents, [
      { eventId: 'pi_1:stock:0', type: 'step:pending', processedAt: new Date() },
    ]);
    expect((await deliver(succeeded())).status).toBe(503);
    expect(isMarked('evt_1')).toBe(false);
    expect(decrementStock).not.toHaveBeenCalled();
  });

  it('never repeats a step left pending by a crash, and reports it', async () => {
    seedOrder();
    h.fake.seed(stripeEvents, [
      {
        eventId: 'pi_1:stock:0',
        type: 'step:pending',
        processedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    ]);
    expect((await deliver(succeeded())).status).toBe(200);
    expect(vi.mocked(decrementStock).mock.calls.map((c) => c[0][0].productId)).toEqual(['p2']);
    expect(Sentry.captureMessage).toHaveBeenCalled();
  });

  it('email failure does not fail the webhook, and is surfaced', async () => {
    seedOrder();
    vi.mocked(sendOrderConfirmation).mockResolvedValue({ success: false, error: 'down' });
    vi.mocked(sendNewOrderAlert).mockRejectedValue(new Error('boom'));
    expect((await deliver(succeeded())).status).toBe(200);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(2);
    expect(isMarked('evt_1')).toBe(true);
  });

  it('never logs the customer email', async () => {
    seedOrder();
    await deliver(succeeded());
    const logged = JSON.stringify([
      ...vi.mocked(console.log).mock.calls,
      ...vi.mocked(console.error).mock.calls,
    ]);
    expect(logged).not.toContain('customer@example.com');
  });

  it('alerts the configured store contact, else the default', async () => {
    seedOrder();
    h.fake.seed(settings, [{ key: 'store', value: { contactEmail: 'owner@example.com' } }]);
    await deliver(succeeded());
    expect(vi.mocked(sendNewOrderAlert).mock.calls[0][1]).toBe('owner@example.com');

    h.fake = createFakeDb();
    seedOrder();
    vi.mocked(sendNewOrderAlert).mockClear();
    await deliver(succeeded());
    expect(vi.mocked(sendNewOrderAlert).mock.calls[0][1]).toBe('admin@modestummah.com');
  });

  it('retries when the order is missing, ignores foreign payments', async () => {
    expect((await deliver(succeeded())).status).toBe(500);
    const foreign = succeeded('evt_x');
    foreign.data.object.metadata = {} as any;
    expect((await deliver(foreign)).status).toBe(200);
  });

  it.each(['refunded', 'partial'])('does not reopen a %s order', async (paymentStatus) => {
    const order = seedOrder({ paymentStatus, status: 'cancelled' });
    expect((await deliver(succeeded())).status).toBe(200);
    expect(order.paymentStatus).toBe(paymentStatus);
    expect(order.status).toBe('cancelled');
    expect(decrementStock).not.toHaveBeenCalled();
    expect(sendOrderConfirmation).not.toHaveBeenCalled();
    expect(h.fake.rows(orderNotes)).toHaveLength(0);
  });

  it('does not move a shipped order back to processing', async () => {
    const order = seedOrder({ status: 'shipped' });
    await deliver(succeeded());
    expect(order.status).toBe('shipped');
  });

  it('reopens an unpaid cancelled order with one timeline note', async () => {
    const order = seedOrder({ status: 'cancelled' });
    await deliver(succeeded());
    expect(order.status).toBe('processing');
    expect(h.fake.rows(orderNotes)).toHaveLength(1);
  });

  it('leaves order pending with a timeline note when PaymentIntent amount mismatches', async () => {
    const order = seedOrder();
    const res = await deliver(succeeded('evt_mismatch', { amount: 100 }));
    expect(res.status).toBe(200);
    expect(order.paymentStatus).toBe('pending');
    expect(decrementStock).not.toHaveBeenCalled();
    expect(h.fake.rows(orderNotes)).toHaveLength(1);
  });

  it('adds a timeline note if coupon usage limit was already reached', async () => {
    seedOrder();
    vi.mocked(recordCouponUsage).mockResolvedValueOnce(false);
    expect((await deliver(succeeded())).status).toBe(200);
    expect(h.fake.rows(orderNotes)).toHaveLength(1);
  });
});

describe('payment_intent.payment_failed', () => {
  const failed = {
    id: 'evt_f',
    type: 'payment_intent.payment_failed',
    data: { object: { id: 'pi_1', metadata: { orderId: 'MU-1' } } },
  };

  it('retries on failure without duplicating the timeline note', async () => {
    const order = seedOrder();
    h.fake.failNext('orders', 'select');
    expect((await deliver(failed)).status).toBe(500);
    expect((await deliver(failed)).status).toBe(200);
    expect(order.paymentStatus).toBe('failed');
    expect(h.fake.rows(orderNotes)).toHaveLength(1);
  });
});

describe('charge.refunded', () => {
  it('restocks each line once across a retry', async () => {
    const order = seedOrder({ paymentStatus: 'paid', status: 'processing' });
    vi.mocked(restock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('stock write failed'));
    expect((await deliver(refunded())).status).toBe(500);
    expect((await deliver(refunded())).status).toBe(200);
    expect(vi.mocked(restock).mock.calls.map((c) => c[0][0].productId)).toEqual(['p1', 'p2', 'p2']);
    expect(order.paymentStatus).toBe('refunded');
    expect(order.status).toBe('cancelled');
    expect(h.fake.rows(orderNotes)).toHaveLength(1);
  });

  it('releases the coupon only on the first move into refunded', async () => {
    seedOrder({ paymentStatus: 'paid' });
    await deliver(refunded('evt_a'));
    await deliver(refunded('evt_b'));
    const couponUpdates = h.fake.log.filter((l: any) => l.table === 'coupons');
    expect(couponUpdates).toHaveLength(1);
    expect(restock).toHaveBeenCalledTimes(2);
  });

  it('an admin refund that got there first still restocks, without a coupon release', async () => {
    seedOrder({ paymentStatus: 'refunded', status: 'cancelled' });
    await deliver(refunded());
    expect(h.fake.log.filter((l: any) => l.table === 'coupons')).toHaveLength(0);
    expect(restock).toHaveBeenCalledTimes(2);
  });

  it('a partial refund leaves stock alone', async () => {
    const order = seedOrder({ paymentStatus: 'paid', status: 'processing' });
    await deliver(refunded('evt_p', false));
    expect(order.paymentStatus).toBe('partial');
    expect(restock).not.toHaveBeenCalled();
  });
});
