import * as Sentry from '@sentry/nextjs';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orderNotes, orders } from '@/lib/schema';
import { releaseCouponUse } from '@/lib/coupons';

/**
 * Lazy expiry of abandoned checkouts. Every checkout inserts an order
 * (pending_payment) before the customer pays, and that order holds a use of
 * its coupon (lib/coupons.ts holdCouponUse). Stock is not held: it drops only
 * when payment succeeds (lib/inventory.ts).
 *
 * There is no timer: Neon must be able to suspend, so nothing polls the
 * database. Instead the checkout route calls this before pricing a new order,
 * which is exactly when a stale hold could wrongly block a customer.
 *
 * An expired order becomes "cancelled" with its payment status left as it was
 * (pending or failed), the same state an admin cancel of an abandoned
 * checkout leaves. The PaymentIntent stays open in Stripe; if it is paid
 * after all, the payment webhook reopens the order as Processing with a
 * timeline note and takes the coupon use again (see the webhook route).
 */

/** An unpaid checkout older than this is abandoned. Card payments finish in minutes. */
export const UNPAID_ORDER_TTL_MS = 60 * 60 * 1000;

export async function expireStaleUnpaidOrders(now: Date = new Date()): Promise<number> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - UNPAID_ORDER_TTL_MS);

  // One conditional statement: an order is flipped by exactly one caller, so
  // two concurrent checkouts (or an admin cancel at the same moment) cannot
  // both release its coupon. A payment that landed first has changed the
  // payment status, so a paid order is never expired.
  const expired = await db
    .update(orders)
    .set({ status: 'cancelled', updatedAt: now })
    .where(
      and(
        eq(orders.status, 'pending_payment'),
        inArray(orders.paymentStatus, ['pending', 'failed']),
        lt(orders.createdAt, cutoff)
      )
    )
    .returning({ id: orders.id, orderId: orders.orderId, couponCode: orders.couponCode });

  for (const order of expired) {
    try {
      if (order.couponCode) await releaseCouponUse(order.couponCode, order.orderId);
      await db.insert(orderNotes).values({
        orderId: order.id,
        note: 'Unpaid for over an hour: cancelled automatically. If the customer still pays, it reopens as Processing.',
        author: 'System',
      });
    } catch (error) {
      // The order is already cancelled, so this is not retried: report it for
      // a manual check of the coupon's use count.
      console.error('Expired order follow-up failed; check its coupon use count');
      Sentry.captureException(error, { tags: { step: 'order-expiry' } });
    }
  }

  return expired.length;
}
