import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { verifyWebhookSignature } from '@/lib/stripe';
import { sendOrderConfirmation } from '@/lib/email';
import Stripe from 'stripe';
import { getDb } from '@/lib/db';
import { orders, carts, stripeEvents } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import type { ShippingAddressDB, OrderItem } from '@/lib/schema';

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

  const db = getDb();

  // Idempotency: Stripe retries events for up to three days. Log each
  // processed event id; skip anything we have already handled.
  const [inserted] = await db
    .insert(stripeEvents)
    .values({ eventId: event.id, type: event.type })
    .onConflictDoNothing()
    .returning();

  if (!inserted) {
    console.log(`Duplicate webhook event skipped: ${event.id} (${event.type})`);
    return NextResponse.json({ received: true });
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log('Payment succeeded:', paymentIntent.id);

      try {
        const metaOrderId = paymentIntent.metadata.orderId;

        const [existingOrder] = await db
          .select()
          .from(orders)
          .where(eq(orders.orderId, metaOrderId))
          .limit(1);

        if (existingOrder) {
          await db
            .update(orders)
            .set({
              paymentStatus: 'paid',
              status: 'processing',
              paymentIntentId: paymentIntent.id,
              updatedAt: new Date(),
            })
            .where(eq(orders.id, existingOrder.id));

          console.log('Order updated:', metaOrderId);

          const items = (existingOrder.items || []) as OrderItem[];
          const shippingAddress = existingOrder.shippingAddress as ShippingAddressDB;
          const email = existingOrder.email;

          // Clear user's cart
          if (existingOrder.userId) {
            try {
              await db
                .update(carts)
                .set({ items: [], updatedAt: new Date() })
                .where(eq(carts.userId, existingOrder.userId));
            } catch {
              // No cart to clear
            }
          }

          // Send order confirmation email
          const customerName = shippingAddress?.firstName || 'Valued Customer';

          if (email) {
            try {
              await sendOrderConfirmation({
                orderId: metaOrderId,
                email,
                customerName,
                items: items.map((item) => ({
                  name: item.name,
                  quantity: item.quantity,
                  price: item.price,
                  image: item.image,
                })),
                subtotal: parseFloat(existingOrder.subtotal as string),
                shipping: parseFloat(existingOrder.shipping as string),
                tax: parseFloat(existingOrder.tax as string),
                total: parseFloat(existingOrder.total as string),
                shippingAddress: {
                  street1: shippingAddress?.address1 || '',
                  street2: shippingAddress?.address2 || '',
                  city: shippingAddress?.city || '',
                  state: shippingAddress?.state || '',
                  zip: shippingAddress?.postalCode || '',
                  country: shippingAddress?.country || 'US',
                },
              });
              console.log('Order confirmation email sent to:', email);
            } catch (emailError) {
              console.error('Failed to send order confirmation email:', emailError);
            }
          }
        } else {
          console.error('CRITICAL: Order not found for orderId:', metaOrderId);
        }
      } catch (error) {
        console.error('Error updating order:', error);
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log('Payment failed:', paymentIntent.id);

      try {
        const metaOrderId = paymentIntent.metadata.orderId;

        const [existingOrder] = await db
          .select()
          .from(orders)
          .where(eq(orders.orderId, metaOrderId))
          .limit(1);

        if (existingOrder) {
          await db
            .update(orders)
            .set({
              paymentStatus: 'failed',
              status: 'cancelled',
              notes: `Payment failed: ${paymentIntent.last_payment_error?.message || 'Unknown error'}`,
              updatedAt: new Date(),
            })
            .where(eq(orders.id, existingOrder.id));
          console.log('Order marked as failed:', metaOrderId);
        }
      } catch (error) {
        console.error('Error updating failed order:', error);
      }
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      console.log('Charge refunded:', charge.id);

      try {
        const [existingOrder] = await db
          .select()
          .from(orders)
          .where(eq(orders.paymentIntentId, charge.payment_intent as string))
          .limit(1);

        if (existingOrder) {
          const refundStatus = charge.refunded ? 'refunded' : 'partial';
          await db
            .update(orders)
            .set({
              paymentStatus: refundStatus as any,
              status: charge.refunded ? 'cancelled' : existingOrder.status,
              notes: `Refund processed: ${charge.amount_refunded / 100} USD`,
              updatedAt: new Date(),
            })
            .where(eq(orders.id, existingOrder.id));
          console.log('Order refund recorded');
        }
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
