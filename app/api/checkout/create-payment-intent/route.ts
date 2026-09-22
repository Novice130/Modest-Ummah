import { NextRequest, NextResponse } from 'next/server';
import { createPaymentIntent } from '@/lib/stripe';
import { getDb } from '@/lib/db';
import { orders } from '@/lib/schema';
import { resolveCheckoutOrder, normalizeShippingAddress } from '@/lib/pricing';
import { generateOrderId } from '@/lib/utils';
import { getAuthFromRequest } from '@/lib/auth';
import type { ShippingAddressDB } from '@/lib/schema';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      amount,
      orderId,
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

    // The web checkout mints its own order id so the confirmation page can be
    // addressed before the payment resolves. The mobile client has no such
    // need, so an absent id is minted here rather than rejected — it only ever
    // has to be unique and to match what goes into the Stripe metadata.
    const resolvedOrderId =
      typeof orderId === 'string' && orderId.trim() ? orderId.trim() : generateOrderId();

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

    const paymentIntent = await createPaymentIntent({
      amount: resolved.total,
      customerEmail: email,
      metadata: {
        orderId: resolvedOrderId,
        userId: ownerId || '',
      },
      currency: 'usd',
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      resolvedTotal: resolved.total,
      resolvedSubtotal: resolved.subtotal,
      resolvedDiscount: resolved.discount,
      resolvedShipping: resolved.shipping,
      resolvedTax: resolved.tax,
    });
  } catch (error: any) {
    console.error('Payment intent creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}
