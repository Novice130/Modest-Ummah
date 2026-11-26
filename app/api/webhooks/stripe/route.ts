import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import * as Sentry from '@sentry/nextjs';
import { verifyWebhookSignature } from '@/lib/stripe';
import { sendNewOrderAlert, sendOrderConfirmation } from '@/lib/email';
import Stripe from 'stripe';
import { getDb } from '@/lib/db';
import { orders, orderNotes, carts, settings } from '@/lib/schema';
import { and, eq, inArray, ne, notInArray } from 'drizzle-orm';
import { decrementStock, restock } from '@/lib/inventory';
import { holdCouponUse, releaseCouponUse } from '@/lib/coupons';
import {
  isEventHandled,
  isStepDone,
  markEventHandled,
  runOnce,
  StepInProgressError,
} from '@/lib/webhook-ledger';
import type { ShippingAddressDB, OrderItem } from '@/lib/schema';

const DEFAULT_ORDER_ALERT_EMAIL = 'admin@modestummah.com';

/** Money has gone back: a replayed success must not make this order paid again. */
const REFUNDED_STATUSES: Array<'refunded' | 'partial'> = ['refunded', 'partial'];

/** Same setting and fallback as lib/actions/contact.actions.ts. */
async function orderAlertRecipient(): Promise<string> {
  try {
    const [row] = await getDb().select().from(settings).where(eq(settings.key, 'store')).limit(1);
    const contact = (row?.value as Record<string, unknown> | undefined)?.contactEmail;
    return (typeof contact === 'string' && contact.trim()) || DEFAULT_ORDER_ALERT_EMAIL;
  } catch {
    return DEFAULT_ORDER_ALERT_EMAIL;
  }
}

/** Email never fails the webhook: the order is already paid and recorded. */
async function sendBestEffort(
  kind: string,
  send: () => Promise<{ success: boolean; error?: string }>
) {
  let failure: string | undefined;
  try {
    const result = await send();
    if (!result.success) failure = result.error || 'unknown error';
  } catch (error: any) {
    failure = error?.message || 'unknown error';
  }
  if (failure !== undefined) {
    console.error(`Order ${kind} email failed`);
    Sentry.captureMessage(`Order ${kind} email failed`, { level: 'error' });
  }
}

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const db = getDb();
  const metaOrderId = paymentIntent.metadata?.orderId;
  if (!metaOrderId) {
    console.log('Payment succeeded for a payment with no order id; ignored');
    return;
  }

  const [existingOrder] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderId, metaOrderId))
    .limit(1);

  if (!existingOrder) {
    // A paid order must not be dropped silently. Stripe retries for three days.
    throw new Error(`Order not found for paid payment: ${metaOrderId}`);
  }

  if (REFUNDED_STATUSES.includes(existingOrder.paymentStatus as 'refunded' | 'partial')) {
    console.warn(`Payment success ignored: order ${metaOrderId} is already refunded`);
    return;
  }

  // What Stripe took must be what this order is for. A mismatch is
  // left for the admin rather than fulfilled.
  const expectedAmount = Math.round(parseFloat(existingOrder.total as string) * 100);
  const mismatch =
    paymentIntent.amount !== expectedAmount
      ? `amount ${paymentIntent.amount} cents, order total ${expectedAmount} cents`
      : paymentIntent.currency !== 'usd'
        ? `currency ${paymentIntent.currency}`
        : existingOrder.paymentIntentId && existingOrder.paymentIntentId !== paymentIntent.id
          ? 'a different PaymentIntent than the one linked to this order'
          : null;
  if (mismatch) {
    await runOnce(`${paymentIntent.id}:mismatch-note`, async () => {
      await db.insert(orderNotes).values({
        orderId: existingOrder.id,
        note: `Payment received in Stripe that does not match this order (${mismatch}). Not marked paid: check Stripe, then fulfil or refund.`,
        author: 'Stripe',
      });
    });
    console.error('Payment does not match order; left for review');
    return;
  }

  // An order cancelled while unpaid (by the admin, or by lib/order-expiry.ts
  // after an hour) can still be paid afterwards: the PaymentIntent stays open.
  // The money is taken, so it reopens for fulfilment; the timeline says why.
  // Stock was never held for it and drops below like any sale (an oversell is
  // logged); its coupon use was given back and is taken again below.
  if (existingOrder.status === 'cancelled') {
    await runOnce(`${paymentIntent.id}:reopen-note`, async () => {
      await db.insert(orderNotes).values({
        orderId: existingOrder.id,
        note: 'Payment received after the order was cancelled. Reopened as Processing: ship it or refund it.',
        author: 'Stripe',
      });
    });
  }

  const shipped = existingOrder.status === 'shipped' || existingOrder.status === 'delivered';
  await db
    .update(orders)
    .set({
      paymentStatus: 'paid',
      // A late retry must not pull a shipped order back to processing.
      status: shipped ? existingOrder.status : 'processing',
      paymentIntentId: paymentIntent.id,
      updatedAt: new Date(),
    })
    // Repeats the check above atomically, in case a refund landed since the read.
    .where(and(eq(orders.id, existingOrder.id), notInArray(orders.paymentStatus, REFUNDED_STATUSES)));

  const items = (existingOrder.items || []) as OrderItem[];
  const shippingAddress = existingOrder.shippingAddress as ShippingAddressDB;

  // One step per line, so a failure on line 2 cannot repeat line 1 on retry.
  // Oversells are logged, not fatal: the customer has already paid.
  for (const [index, item] of items.entries()) {
    await runOnce(`${paymentIntent.id}:stock:${index}`, () => decrementStock([item]));
  }

  // The coupon use was taken when the order was created and is normally still
  // held, so this counts nothing. It takes the use only for an order that gave
  // it back (expired or cancelled before this late payment) or that predates
  // reservations; holdCouponUse is a no-op for an order already holding one.
  const couponCode = existingOrder.couponCode;
  if (couponCode) {
    await runOnce(`${paymentIntent.id}:coupon`, async () => {
      const held = await holdCouponUse(couponCode, existingOrder.orderId);
      if (!held) {
        await db.insert(orderNotes).values({
          orderId: existingOrder.id,
          note: `Coupon ${couponCode} was already at its usage limit when this order was paid. The discount was honoured; the use was not counted.`,
          author: 'Stripe',
        });
      }
    });
  }

  // A step too: a replay days later must not wipe a cart the customer has since refilled.
  const userId = existingOrder.userId;
  if (userId) {
    await runOnce(`${paymentIntent.id}:cart`, async () => {
      await db.update(carts).set({ items: [], updatedAt: new Date() }).where(eq(carts.userId, userId));
    });
  }

  // Emails last, so a retry for an earlier failure cannot send them twice.
  const emailData = {
    orderId: metaOrderId,
    email: existingOrder.email,
    customerName: shippingAddress?.firstName || 'Valued Customer',
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
  };

  if (existingOrder.email) {
    await runOnce(`${paymentIntent.id}:email`, () =>
      sendBestEffort('confirmation', () => sendOrderConfirmation(emailData))
    );
  }
  await runOnce(`${paymentIntent.id}:admin-alert`, async () => {
    const recipient = await orderAlertRecipient();
    await sendBestEffort('admin alert', () => sendNewOrderAlert(emailData, recipient));
  });
}

async function handlePaymentFailed(eventId: string, paymentIntent: Stripe.PaymentIntent) {
  const db = getDb();
  const metaOrderId = paymentIntent.metadata?.orderId;
  if (!metaOrderId) return;

  const [existingOrder] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderId, metaOrderId))
    .limit(1);
  if (!existingOrder) return;

  // The order stays awaiting payment: the customer can retry the card on the
  // same PaymentIntent, and payment_intent.succeeded then moves it on. An
  // abandoned one is cancelled from the admin.
  await db
    .update(orders)
    .set({ paymentStatus: 'failed', updatedAt: new Date() })
    // Stripe retries can deliver a failure after the success or a refund; only
    // an unpaid order may be marked failed.
    .where(and(eq(orders.id, existingOrder.id), inArray(orders.paymentStatus, ['pending', 'failed'])));
  await runOnce(`${eventId}:note`, async () => {
    await db.insert(orderNotes).values({
      orderId: existingOrder.id,
      note: `Payment failed: ${paymentIntent.last_payment_error?.message || 'Unknown error'}`,
      author: 'Stripe',
    });
  });
}

async function handleChargeRefunded(eventId: string, charge: Stripe.Charge) {
  const db = getDb();
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  const [existingOrder] = await db
    .select()
    .from(orders)
    .where(eq(orders.paymentIntentId, paymentIntentId))
    .limit(1);
  if (!existingOrder) return;

  const refundStatus = charge.refunded ? 'refunded' : 'partial';
  // A shipped or delivered order keeps its status (a return); an unshipped one
  // is cancelled by a full refund.
  const shipped = existingOrder.status === 'shipped' || existingOrder.status === 'delivered';
  await db
    .update(orders)
    .set({
      paymentStatus: refundStatus,
      status: charge.refunded && !shipped ? 'cancelled' : existingOrder.status,
      updatedAt: new Date(),
    })
    .where(and(eq(orders.id, existingOrder.id), ne(orders.paymentStatus, 'refunded')));

  await runOnce(`${eventId}:note`, async () => {
    await db.insert(orderNotes).values({
      orderId: existingOrder.id,
      note: `Refund processed in Stripe: ${(charge.amount_refunded / 100).toFixed(2)} USD refunded in total.`,
      author: 'Stripe',
    });
  });

  // A full refund gives the coupon use back. The hold marker makes this
  // exactly once whoever gets there first (this webhook, a retry of it, or an
  // admin refund through refundOrderAction), and it releases nothing for an
  // order that no longer holds a use. A failure is reported rather than
  // holding up the restock below.
  if (charge.refunded && existingOrder.couponCode) {
    try {
      await releaseCouponUse(existingOrder.couponCode, existingOrder.orderId);
    } catch (error) {
      console.error('Coupon use not released after a refund; adjust it by hand');
      Sentry.captureException(error, { tags: { webhook: 'stripe', step: 'coupon-release' } });
    }
  }

  // Full refunds of unshipped orders restock. Partial refunds leave stock alone
  // (without per-item refund quantities we cannot know what to restock safely)
  // and returned goods are restocked by hand.
  if (charge.refunded && !shipped) {
    const items = (existingOrder.items || []) as OrderItem[];
    for (const [index, item] of items.entries()) {
      // Restock only lines whose stock was actually taken on payment.
      if (!(await isStepDone(`${paymentIntentId}:stock:${index}`))) continue;
      await runOnce(`${charge.id}:restock:${index}`, () => restock([item]));
    }
  }
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

  // An event only counts as handled once everything below has succeeded. Any
  // non-2xx makes Stripe retry for up to three days, and lib/webhook-ledger.ts
  // keeps the retry from repeating a side effect that already happened.
  try {
    if (await isEventHandled(event.id)) {
      // Logging the event type only: ids and payloads stay out of logs.
      console.log(`Duplicate webhook event skipped (${event.type})`);
      return NextResponse.json({ received: true });
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.id, event.data.object as Stripe.PaymentIntent);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event.id, event.data.object as Stripe.Charge);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    await markEventHandled(event.id, event.type);
    return NextResponse.json({ received: true });
  } catch (error: any) {
    if (error instanceof StepInProgressError) {
      console.log(`Webhook event already in progress (${event.type}); asking Stripe to retry`);
      return NextResponse.json({ error: 'In progress' }, { status: 503 });
    }
    console.error(`Webhook processing failed (${event.type}):`, error?.message);
    Sentry.captureException(error, { tags: { webhook: 'stripe', eventType: event.type } });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
