import { NextRequest, NextResponse } from 'next/server';
import { createPaymentIntent } from '@/lib/stripe';
import PocketBase from 'pocketbase';

// Server-side PocketBase instance
function getServerPocketBase() {
  return new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Received body:', JSON.stringify(body, null, 2));
    const { 
      amount, 
      orderId, 
      customerEmail, 
      shippingAddress, 
      items, 
      userId,
      shipping,
      tax,
      shippingService
    } = body;

    console.log('Parsed items:', items);

    if (!amount || !orderId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 1. Create the order in PocketBase first with status 'pending_payment'
    const pb = getServerPocketBase();
    
    // Convert amounts to plain numbers/float
    const subtotal = amount - (shipping || 0) - (tax || 0);

    try {
      // Order doesn't exist, create it
      await pb.collection('orders').create({
          orderId,
          user: userId || undefined,
          email: customerEmail || shippingAddress.email || '',
          items: JSON.stringify(items),
          shippingAddress: JSON.stringify(shippingAddress),
          billingAddress: JSON.stringify(shippingAddress),
          subtotal: subtotal,
          shipping: shipping || 0,
          tax: tax || 0,
          total: amount,
          status: 'pending_payment',
          paymentStatus: 'pending',
          shippingService: shippingService,
        });
      } catch (pbError: any) {
        console.error('Failed to create order in PocketBase (Schema Mismatch?):', pbError);
        // Do not throw, allow Stripe Intent creation to proceed so user can pay.
        // The webhook might fail to fulfill, but the checkout won't freeze/crash.
      }

    // 2. Create Stripe PaymentIntent with minimal metadata
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
