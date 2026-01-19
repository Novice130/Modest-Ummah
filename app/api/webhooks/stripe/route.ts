import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { verifyWebhookSignature } from '@/lib/stripe';
import Stripe from 'stripe';
import PocketBase from 'pocketbase';

// Server-side PocketBase instance for webhooks
function getServerPocketBase() {
  return new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090');
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = verifyWebhookSignature(body, signature);
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error.message);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  const pb = getServerPocketBase();

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log('Payment succeeded:', paymentIntent.id);
      
      try {
        const orderId = paymentIntent.metadata.orderId;
        const items = JSON.parse(paymentIntent.metadata.items || '[]');
        const shippingAddress = JSON.parse(paymentIntent.metadata.shippingAddress || '{}');
        const userId = paymentIntent.metadata.userId || null;
        const subtotal = parseFloat(paymentIntent.metadata.subtotal || '0');
        const shippingCost = parseFloat(paymentIntent.metadata.shipping || '0');
        const tax = parseFloat(paymentIntent.metadata.tax || '0');
        
        // Check if order already exists
        let existingOrder = null;
        try {
          existingOrder = await pb.collection('orders').getFirstListItem(
            `orderId="${orderId}"`
          );
        } catch {
          // Order doesn't exist, we'll create it
        }

        if (existingOrder) {
          // Update existing order
          await pb.collection('orders').update(existingOrder.id, {
            paymentStatus: 'paid',
            status: 'processing',
            paymentIntentId: paymentIntent.id,
            updated: new Date().toISOString(),
          });
          console.log('Order updated:', orderId);
        } else {
          // Create new order
          await pb.collection('orders').create({
            orderId,
            user: userId,
            email: paymentIntent.receipt_email || shippingAddress.email || '',
            items: JSON.stringify(items),
            shippingAddress: JSON.stringify(shippingAddress),
            billingAddress: JSON.stringify(shippingAddress), // Same as shipping by default
            subtotal: subtotal,
            shipping: shippingCost,
            tax: tax,
            total: paymentIntent.amount / 100,
            status: 'processing',
            paymentStatus: 'paid',
            paymentIntentId: paymentIntent.id,
          });
          console.log('Order created:', orderId);
        }

        // Clear user's cart if they were logged in
        if (userId) {
          try {
            const cart = await pb.collection('carts').getFirstListItem(
              `user="${userId}"`
            );
            await pb.collection('carts').update(cart.id, {
              items: '[]',
            });
          } catch {
            // No cart to clear
          }
        }
      } catch (error) {
        console.error('Error creating/updating order:', error);
        // Still return 200 to acknowledge receipt
      }
      
      break;
    }
    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log('Payment failed:', paymentIntent.id);
      
      try {
        const orderId = paymentIntent.metadata.orderId;
        
        // Try to find and update the order
        const existingOrder = await pb.collection('orders').getFirstListItem(
          `orderId="${orderId}"`
        );
        
        await pb.collection('orders').update(existingOrder.id, {
          paymentStatus: 'failed',
          status: 'cancelled',
          notes: `Payment failed: ${paymentIntent.last_payment_error?.message || 'Unknown error'}`,
          updated: new Date().toISOString(),
        });
        console.log('Order marked as failed:', orderId);
      } catch (error) {
        console.error('Error updating failed order:', error);
      }
      
      break;
    }
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log('Checkout session completed:', session.id);
      
      try {
        const orderId = session.metadata?.orderId;
        if (!orderId) {
          console.log('No orderId in session metadata');
          break;
        }

        // Get line items from the session
        const lineItems = await fetch(
          `https://api.stripe.com/v1/checkout/sessions/${session.id}/line_items`,
          {
            headers: {
              Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
            },
          }
        ).then(res => res.json());

        // Create order from checkout session
        await pb.collection('orders').create({
          orderId,
          user: session.metadata?.userId || null,
          email: session.customer_email || session.customer_details?.email || '',
          items: JSON.stringify(lineItems.data || []),
          shippingAddress: JSON.stringify(session.shipping_details?.address || {}),
          subtotal: (session.amount_subtotal || 0) / 100,
          shipping: (session.shipping_cost?.amount_total || 0) / 100,
          tax: ((session.total_details?.amount_tax || 0)) / 100,
          total: (session.amount_total || 0) / 100,
          status: 'processing',
          paymentStatus: 'paid',
          paymentIntentId: session.payment_intent as string,
        });
        console.log('Order created from checkout session:', orderId);
      } catch (error) {
        console.error('Error creating order from checkout session:', error);
      }
      
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      console.log('Charge refunded:', charge.id);
      
      try {
        // Find order by payment intent
        const existingOrder = await pb.collection('orders').getFirstListItem(
          `paymentIntentId="${charge.payment_intent}"`
        );
        
        const refundStatus = charge.refunded ? 'refunded' : 'partial';
        
        await pb.collection('orders').update(existingOrder.id, {
          paymentStatus: refundStatus,
          status: charge.refunded ? 'cancelled' : existingOrder.status,
          notes: `Refund processed: ${charge.amount_refunded / 100} USD`,
          updated: new Date().toISOString(),
        });
        console.log('Order refund recorded');
      } catch (error) {
        console.error('Error recording refund:', error);
      }
      
      break;
    }
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
