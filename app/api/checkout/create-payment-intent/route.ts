import { NextRequest, NextResponse } from 'next/server';
import { createPaymentIntent } from '@/lib/stripe';
import { getDb } from '@/lib/db';
import { orders } from '@/lib/schema';
import { and, eq } from 'drizzle-orm';
import { resolveCheckoutOrder, normalizeShippingAddress, CheckoutRejectedError } from '@/lib/pricing';
import { generateOrderId } from '@/lib/utils';
import { getAuthFromRequest } from '@/lib/auth';
import type { ShippingAddressDB } from '@/lib/schema';
import { rateLimitRoute } from '@/lib/rate-limit-guards';
import { holdCouponUse, releaseCouponUse } from '@/lib/coupons';
import { expireStaleUnpaidOrders } from '@/lib/order-expiry';

/**
 * Remove an order that never reached payment (its coupon use was refused or
 * could not be taken). Nothing references it yet: no PaymentIntent, no notes.
 * If the delete fails, expiry cancels it later; it holds no use.
 */
async function discardOrder(orderId: string) {
  try {
    await getDb().delete(orders).where(eq(orders.orderId, orderId));
  } catch (error) {
    console.error('Discarding an unpayable order failed:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimitRoute(request, 'paymentIntent');
    if (limited) return limited;
    const body = await request.json();
    const {
      amount,
      customerEmail,
      shippingAddress,
      items,
      shipping,
      tax,
      discount,
      shippingService,
      couponCode,
    } = body;

    // Tampered or stale client totals must never reach Stripe. Rejecting
    // (rather than silently overwriting) keeps tampering visible in logs.
    if (amount !== undefined || shipping !== undefined || tax !== undefined || discount !== undefined) {
      return NextResponse.json(
        {
          error:
            'Client-supplied totals are not accepted. Prices and discounts are resolved server-side.',
        },
        { status: 400 }
      );
    }

    // The order id is always minted here. A client-supplied `orderId` (the
    // web checkout still sends one) is ignored: it is returned below instead.
    const resolvedOrderId = generateOrderId();

    // Abandoned checkouts give back their coupon uses before this one is
    // priced, so a stale hold cannot block it. Lazy on purpose: nothing polls
    // the database on a timer. Never fails the checkout.
    try {
      await expireStaleUnpaidOrders();
    } catch (error) {
      console.error('Expiring stale unpaid orders failed:', error);
    }

    const resolved = await resolveCheckoutOrder({
      items,
      shippingAddress,
      shippingService,
      couponCode: typeof couponCode === 'string' ? couponCode : null,
    });

    const address = normalizeShippingAddress(shippingAddress);
    const email = customerEmail || address.email || '';

    if (!email) {
      return NextResponse.json(
        { error: 'Customer email is required' },
        { status: 400 }
      );
    }

    // Whose order this is comes from the session or the bearer token, never
    // from the body: a client-supplied `userId` would let anyone file an order
    // under someone else's account. Cookie and bearer both resolve here, so
    // the web and the app land on the same identity.
    const auth = await getAuthFromRequest(request);
    const ownerId = auth && auth.type === 'user' ? auth.sub : null;

    const db = getDb();

    // The order row is created before payment; if this insert fails, the
    // PaymentIntent must not be created (previously the failure was swallowed).
    await db.insert(orders).values({
      orderId: resolvedOrderId,
      userId: ownerId,
      email,
      items: resolved.items,
      shippingAddress: address as ShippingAddressDB,
      billingAddress: address as ShippingAddressDB,
      subtotal: String(resolved.subtotal),
      discount: String(resolved.discount),
      couponCode: resolved.couponCode,
      shipping: String(resolved.shipping),
      tax: String(resolved.tax),
      total: String(resolved.total),
      status: 'pending_payment',
      paymentStatus: 'pending',
      shippingService: resolved.shippingService || null,
    });

    // The coupon use is taken now, atomically against its limit, and held
    // until the order is paid, or given back when it expires, is cancelled or
    // fully refunded. resolveCheckoutOrder already checked the limit; this
    // catches two checkouts racing for the last use. The order exists first,
    // so every hold belongs to an order that expiry can find.
    let couponHeld = false;
    if (resolved.couponCode) {
      try {
        couponHeld = await holdCouponUse(resolved.couponCode, resolvedOrderId);
      } catch (error) {
        await discardOrder(resolvedOrderId);
        throw error;
      }
      if (!couponHeld) {
        await discardOrder(resolvedOrderId);
        return NextResponse.json({ error: 'This coupon code is not valid' }, { status: 409 });
      }
    }

    let paymentIntent: Awaited<ReturnType<typeof createPaymentIntent>>;
    try {
      paymentIntent = await createPaymentIntent({
        amount: resolved.total,
        customerEmail: email,
        metadata: {
          orderId: resolvedOrderId,
          userId: ownerId || '',
        },
        currency: 'usd',
      });
    } catch (error) {
      // No PaymentIntent, so this order can never be paid: end it now rather
      // than holding the coupon use until it expires.
      try {
        const [cancelled] = await db
          .update(orders)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(and(eq(orders.orderId, resolvedOrderId), eq(orders.status, 'pending_payment')))
          .returning({ id: orders.id });
        if (cancelled && couponHeld) await releaseCouponUse(resolved.couponCode, resolvedOrderId);
      } catch (cleanupError) {
        console.error('Cleanup after a failed PaymentIntent failed:', cleanupError);
      }
      throw error;
    }

    // Linked now rather than on payment success, so the admin can find an
    // unpaid checkout's PaymentIntent in Stripe.
    await db
      .update(orders)
      .set({ paymentIntentId: paymentIntent.id })
      .where(eq(orders.orderId, resolvedOrderId));

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      orderId: resolvedOrderId,
      resolvedTotal: resolved.total,
      resolvedSubtotal: resolved.subtotal,
      resolvedDiscount: resolved.discount,
      resolvedShipping: resolved.shipping,
      resolvedTax: resolved.tax,
    });
  } catch (error: any) {
    if (error instanceof CheckoutRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    // Logged in full; the client gets a generic message, since a raw error
    // can carry SQL or provider details.
    console.error('Payment intent creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}
