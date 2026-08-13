import { NextRequest, NextResponse } from 'next/server';
import { createPaymentIntent } from '@/lib/stripe';
import { getDb } from '@/lib/db';
import { orders } from '@/lib/schema';
import { resolveCheckoutOrder, normalizeShippingAddress } from '@/lib/pricing';
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
      userId,
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

    if (!orderId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
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

    const db = getDb();

    // The order row is created before payment; if this insert fails, the
    // PaymentIntent must not be created (previously the failure was swallowed).
    await db.insert(orders).values({
      orderId,
      userId: userId || null,
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
        orderId,
        userId: userId || '',
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
