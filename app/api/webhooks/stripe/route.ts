import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { verifyWebhookSignature } from '@/lib/stripe';
import { sendOrderConfirmation } from '@/lib/email';
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
        // Metadata no longer contains full items/address to avoid limits
        // We MUST fetch the existing order from PB
        
        let existingOrder = null;
        try {
          existingOrder = await pb.collection('orders').getFirstListItem(
            `orderId="${orderId}"`
          );
        } catch {
          console.error(`Order not found for orderId: ${orderId}`);
          // If order doesn't exist, we can't fulfill it because we don't have items in metadata anymore.
          // This should not happen if create-payment-intent created it.
          // Fallback: try to parse metadata just in case (backward compatibility?)
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

          // Get items and address from the stored order
          const items = JSON.parse(existingOrder.items || '[]');
          const shippingAddress = JSON.parse(existingOrder.shippingAddress || '{}');
          const email = existingOrder.email;

          // Clear user's cart if they were logged in
          if (existingOrder.user) {
            try {
              const cart = await pb.collection('carts').getFirstListItem(
                `user="${existingOrder.user}"`
              );
              await pb.collection('carts').update(cart.id, {
                items: '[]',
              });
            } catch {
              // No cart to clear or error
            }
          }

          // Send order confirmation email
          const customerName = shippingAddress.name || shippingAddress.firstName || 'Valued Customer';
          
          if (email) {
            try {
              await sendOrderConfirmation({
                orderId,
                email: email,
                customerName,
                items: items.map((item: any) => ({
                  name: item.name,
                  quantity: item.quantity,
                  price: item.price,
                  image: item.image,
                })),
                subtotal: existingOrder.subtotal,
                shipping: existingOrder.shipping,
                tax: existingOrder.tax,
                total: existingOrder.total,
                shippingAddress: {
                  street1: shippingAddress.street1 || shippingAddress.address1 || '',
                  street2: shippingAddress.street2 || shippingAddress.address2 || '',
                  city: shippingAddress.city || '',
                  state: shippingAddress.state || '',
                  zip: shippingAddress.postalCode || shippingAddress.zip || '',
                  country: shippingAddress.country || 'US',
                },
              });
              console.log('Order confirmation email sent to:', email);
            } catch (emailError) {
              console.error('Failed to send order confirmation email:', emailError);
            }
          }
        } else {
           console.error('CRITICAL: Order not found in PB and full metadata missing. Cannot fulfill.');
        }

      } catch (error) {
        console.error('Error creating/updating order:', error);
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
