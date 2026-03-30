import { NextRequest, NextResponse } from 'next/server';
import { createPaymentIntent } from '@/lib/stripe';
import { getDb } from '@/lib/db';
import { orders } from '@/lib/schema';
import type { ShippingAddressDB, OrderItem } from '@/lib/schema';

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
      shippingService,
    } = body;

    if (!amount || !orderId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const subtotal = amount - (shipping || 0) - (tax || 0);
    const db = getDb();

    try {
      await db.insert(orders).values({
        orderId,
        userId: userId || null,
        email: customerEmail || shippingAddress?.email || '',
        items: (items || []) as OrderItem[],
        shippingAddress: (typeof shippingAddress === 'string'
          ? JSON.parse(shippingAddress)
          : shippingAddress || {}) as ShippingAddressDB,
        billingAddress: (typeof shippingAddress === 'string'
          ? JSON.parse(shippingAddress)
          : shippingAddress || {}) as ShippingAddressDB,
        subtotal: String(subtotal),
        shipping: String(shipping || 0),
        tax: String(tax || 0),
        total: String(amount),
        status: 'pending_payment',
        paymentStatus: 'pending',
        shippingService: shippingService || null,
      });
    } catch (dbError: any) {
      console.error('Failed to create order in database:', dbError);
      // Don't throw — allow Stripe creation to proceed
    }

    const paymentIntent = await createPaymentIntent({
      amount,
      customerEmail,
      metadata: {
        orderId,
        userId: userId || '',
      },
      currency: 'usd',
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error: any) {
    console.error('Payment intent creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}
