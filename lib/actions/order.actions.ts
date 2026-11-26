'use server';

import { getDb } from '@/lib/db';
import { orders, orderNotes, type OrderSelect, type OrderItem, type ShippingAddressDB } from '@/lib/schema';
import { eq, ne, desc, asc, and, or, count } from 'drizzle-orm';
import { releaseCouponUse } from '@/lib/coupons';
import { buildOrderFilter } from '@/lib/order-filters';
import type { Order } from '@/types';
import { getSession } from '@/lib/session';
import {
  ORDER_STATUSES,
  canTransition,
  transitionError,
  formatOrderStatus,
  isPaymentCaptured,
  type OrderStatusValue,
  type PaymentStatusValue,
  type OrderListFilters,
  type OrderListSort,
  type OrderListTab,
} from '@/lib/order-status';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shared authorization rule for reading a single order: an admin may read
 * any order; a user may read only their own. Returns the caller's session
 * when allowed, or null when denied. Next.js guidance is to verify
 * authorization inside each Server Function rather than relying on the
 * proxy/middleware layer alone.
 */
export async function assertOrderAccess(
  order: { userId: string | null } | null
): Promise<Awaited<ReturnType<typeof getSession>> | null> {
  if (!order) return null;

  const [adminSession, userSession] = await Promise.all([
    getSession(true),
    getSession(false),
  ]);

  if (adminSession) return adminSession;

  if (userSession && order.userId && order.userId === userSession.id) {
    return userSession;
  }

  return null;
}

async function requireAdmin() {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');
  return session;
}

function money(value: unknown): number {
  const n = parseFloat(String(value ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

function mapOrder(o: OrderSelect): Order {
  return {
    id: o.id,
    created: o.createdAt.toISOString(),
    updated: o.updatedAt.toISOString(),
    orderId: o.orderId,
    user: o.userId || undefined,
    email: o.email,
    items: JSON.stringify(o.items || []),
    subtotal: money(o.subtotal),
    shipping: money(o.shipping),
    tax: money(o.tax),
    total: money(o.total),
    status: o.status as Order['status'],
    paymentStatus: o.paymentStatus as Order['paymentStatus'],
    paymentIntentId: o.paymentIntentId || undefined,
    shippingAddress: (o.shippingAddress || {}) as Order['shippingAddress'],
    billingAddress: (o.billingAddress || undefined) as Order['billingAddress'],
    notes: o.notes || undefined,
    trackingNumber: o.trackingNumber || undefined,
    trackingCarrier: o.trackingCarrier || undefined,
  };
}

// ─── Admin order shape ──────────────────────────────────

/**
 * What the admin list and detail pages render. Unlike the customer-facing
 * `Order` type, items are a real array (the detail page used to call .map()
 * on the JSON string and crash) and every money/fulfilment column the
 * schema holds is present, so the totals shown actually add up.
 */
export interface AdminOrder {
  id: string;
  wooId: number | null;
  orderId: string;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  email: string;
  customerName: string;
  items: OrderItem[];
  itemCount: number;
  subtotal: number;
  discount: number;
  couponCode: string | null;
  shipping: number;
  shippingService: string | null;
  tax: number;
  total: number;
  status: OrderStatusValue;
  paymentStatus: PaymentStatusValue;
  paymentIntentId: string | null;
  shippingAddress: ShippingAddressDB;
  billingAddress: ShippingAddressDB | null;
  notes: string | null;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  labelUrl: string | null;
  shipmentId: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  externalSource: string | null;
}

export interface AdminOrderNote {
  id: string;
  note: string;
  customerNote: boolean;
  author: string;
  createdAt: string;
}

export interface AdminOrderDetail extends AdminOrder {
  timeline: AdminOrderNote[];
  /** Estimated parcel from the weight snapshots on the line items. */
  parcel: { weightOz: number; length: number; width: number; height: number } | null;
}

function toAdminOrder(o: OrderSelect): AdminOrder {
  const items = Array.isArray(o.items) ? (o.items as OrderItem[]) : [];
  const address = (o.shippingAddress || {}) as ShippingAddressDB;
  return {
    id: o.id,
    wooId: o.wooId ?? null,
    orderId: o.orderId,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    userId: o.userId,
    email: o.email,
    customerName: `${address.firstName || ''} ${address.lastName || ''}`.trim(),
    items,
    itemCount: items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0),
    subtotal: money(o.subtotal),
    discount: money(o.discount),
    couponCode: o.couponCode,
    shipping: money(o.shipping),
    shippingService: o.shippingService,
    tax: money(o.tax),
    total: money(o.total),
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentIntentId: o.paymentIntentId,
    shippingAddress: address,
    billingAddress: (o.billingAddress as ShippingAddressDB | null) || null,
    notes: o.notes,
    trackingNumber: o.trackingNumber,
    trackingCarrier: o.trackingCarrier,
    labelUrl: o.labelUrl,
    shipmentId: o.shipmentId,
    shippedAt: o.shippedAt ? o.shippedAt.toISOString() : null,
    deliveredAt: o.deliveredAt ? o.deliveredAt.toISOString() : null,
    externalSource: o.externalSource,
  };
}

async function loadOrderRow(orderId: string): Promise<OrderSelect> {
  const db = getDb();
  const where = UUID_RE.test(orderId)
    ? or(eq(orders.id, orderId), eq(orders.orderId, orderId))
    : eq(orders.orderId, orderId);
  const [order] = await db.select().from(orders).where(where).limit(1);
  if (!order) throw new Error('Order not found');
  return order;
}

async function addTimelineEntry(orderId: string, note: string, author: string, customerNote = false) {
  const db = getDb();
  await db.insert(orderNotes).values({ orderId, note, author, customerNote });
}

function authorOf(session: { email?: string; name?: string }): string {
  return session.name || session.email || 'admin';
}

/**
 * Write `set` only if the order is still in the state the decision was made
 * against. Guards against the Stripe webhook or Pirate Ship changing the
 * order between the admin's read and write (e.g. a checkout being paid at
 * the moment the admin cancels it as abandoned).
 */
async function guardedUpdate(order: OrderSelect, set: Partial<typeof orders.$inferInsert>) {
  const db = getDb();
  const [updated] = await db
    .update(orders)
    .set({ ...set, updatedAt: new Date() })
    .where(
      and(
        eq(orders.id, order.id),
        eq(orders.status, order.status),
        eq(orders.paymentStatus, order.paymentStatus)
      )
    )
    .returning();
  if (!updated) {
    throw new Error('This order was changed by another process. Reload the page and try again.');
  }
  return updated;
}

// ─── Customer-facing reads ──────────────────────────────

export async function fetchUserOrders() {
  const session = await getSession();
  if (!session?.id) return [];

  const db = getDb();
  const items = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, session.id))
    .orderBy(desc(orders.createdAt))
    .limit(50);

  return items.map(mapOrder);
}

/**
 * One order for the customer's own order page. The ownership check is in the
 * query, so another customer's order, a guest order and an unknown id all look
 * the same (null, which the page renders as a 404). Selects only what a
 * customer may see: no notes, payment intent or label data. Admins get no
 * bypass here; they have the admin order page.
 */
export async function fetchCustomerOrder(orderId: string) {
  const session = await getSession();
  if (!session?.id || !orderId) return null;

  const db = getDb();
  const [order] = await db
    .select({
      orderId: orders.orderId,
      items: orders.items,
      subtotal: orders.subtotal,
      discount: orders.discount,
      couponCode: orders.couponCode,
      shipping: orders.shipping,
      tax: orders.tax,
      total: orders.total,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      shippingAddress: orders.shippingAddress,
      trackingNumber: orders.trackingNumber,
      trackingCarrier: orders.trackingCarrier,
      shippedAt: orders.shippedAt,
      deliveredAt: orders.deliveredAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(and(eq(orders.userId, session.id), eq(orders.orderId, orderId)))
    .limit(1);

  return order ?? null;
}

/**
 * Accepts the uuid or the human order number. The uuid column used to be
 * queried with any string first, which made Postgres throw on "ORD-…" before
 * the order-number fallback ever ran.
 */
export async function fetchOrderById(orderId: string): Promise<Order | null> {
  let result: OrderSelect;
  try {
    result = await loadOrderRow(orderId);
  } catch {
    return null;
  }

  const allowed = await assertOrderAccess(result);
  if (!allowed) return null;

  return mapOrder(result);
}

// ─── Admin reads ────────────────────────────────────────

export async function fetchAdminOrderAction(orderId: string): Promise<AdminOrderDetail | null> {
  await requireAdmin();

  let row: OrderSelect;
  try {
    row = await loadOrderRow(orderId);
  } catch {
    return null;
  }

  const db = getDb();
  const notes = await db
    .select()
    .from(orderNotes)
    .where(eq(orderNotes.orderId, row.id))
    .orderBy(desc(orderNotes.createdAt))
    .limit(200);

  const order = toAdminOrder(row);

  let parcel: AdminOrderDetail['parcel'] = null;
  try {
    const { computeParcel } = await import('@/lib/parcel');
    const p = await computeParcel(
      order.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
        weightOz: i.weightOz,
      }))
    );
    parcel = {
      weightOz: Math.round(p.weight * 10) / 10,
      length: p.length,
      width: p.width,
      height: p.height,
    };
  } catch (error) {
    console.error('Parcel estimate failed:', error);
  }

  return {
    ...order,
    parcel,
    timeline: notes.map((n) => ({
      id: n.id,
      note: n.note,
      customerNote: n.customerNote,
      author: n.author,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

export async function fetchAllOrdersAdmin({
  page = 1,
  limit = 25,
  sort = 'newest' as OrderListSort,
  ...filters
}: OrderListFilters & { page?: number; limit?: number; sort?: OrderListSort } = {}) {
  await requireAdmin();

  const db = getDb();
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 25, 1), 200);
  const safePage = Math.max(Math.floor(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const where = buildOrderFilter(filters);
  // Tab counts honour every filter except the tab itself.
  const whereNoTab = buildOrderFilter(filters, false);

  const orderBy =
    sort === 'oldest'
      ? [asc(orders.createdAt)]
      : sort === 'total_desc'
      ? [desc(orders.total), desc(orders.createdAt)]
      : sort === 'total_asc'
      ? [asc(orders.total), desc(orders.createdAt)]
      : [desc(orders.createdAt)];

  const [[countResult], rows, statusRows] = await Promise.all([
    db.select({ count: count() }).from(orders).where(where),
    db
      .select()
      .from(orders)
      .where(where)
      .orderBy(...orderBy)
      .limit(safeLimit)
      .offset(offset),
    db
      .select({ status: orders.status, count: count() })
      .from(orders)
      .where(whereNoTab)
      .groupBy(orders.status),
  ]);

  const byStatus = new Map(statusRows.map((r) => [r.status, Number(r.count)]));
  const n = (s: OrderStatusValue) => byStatus.get(s) || 0;
  const tabCounts: Record<OrderListTab, number> = {
    all: ORDER_STATUSES.filter((s) => s !== 'pending_payment').reduce((sum, s) => sum + n(s), 0),
    unfulfilled: n('pending') + n('processing'),
    shipped: n('shipped'),
    delivered: n('delivered'),
    cancelled: n('cancelled'),
    pending_payment: n('pending_payment'),
  };

  const totalItems = Number(countResult?.count || 0);

  return {
    items: rows.map(toAdminOrder),
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / safeLimit)),
    page: safePage,
    limit: safeLimit,
    tabCounts,
  };
}

// ─── Admin writes ───────────────────────────────────────

/**
 * Manual status change (processing / on hold / delivered). Shipping goes
 * through fulfillOrderAction so tracking and the customer email travel with
 * it; cancelling through cancelOrderAction; refunds through refundOrderAction.
 */
export async function updateOrderStatusAction(orderId: string, status: OrderStatusValue) {
  const session = await requireAdmin();
  if (!(['processing', 'pending', 'delivered', 'shipped'] as string[]).includes(status)) {
    throw new Error('Use Cancel or Refund for that change.');
  }

  const order = await loadOrderRow(orderId);
  if (!canTransition(order, status)) throw new Error(transitionError(order, status));

  const set: Partial<typeof orders.$inferInsert> = { status };
  if (status === 'shipped' && !order.shippedAt) set.shippedAt = new Date();
  if (status === 'delivered') {
    set.deliveredAt = new Date();
    if (!order.shippedAt) set.shippedAt = new Date();
  }

  const updated = await guardedUpdate(order, set);
  await addTimelineEntry(
    order.id,
    `Status changed from ${formatOrderStatus(order.status)} to ${formatOrderStatus(status)}.`,
    authorOf(session)
  );
  return toAdminOrder(updated);
}

const TRACKING_RE = /^[A-Z0-9]{6,40}$/;

/**
 * Save tracking and (optionally) mark the order shipped and email the
 * customer, in one step: the admin equivalent of what the Pirate Ship
 * writeback does. Previously "Mark Shipped" and "Save Tracking" were
 * separate, neither set shipped_at, and the customer was never told.
 *
 * The email goes out only when the order transitions to shipped or the
 * tracking number changes, so re-saving never re-sends it.
 */
export async function fulfillOrderAction(
  orderId: string,
  input: {
    trackingNumber?: string;
    trackingCarrier?: string;
    markShipped?: boolean;
    notifyCustomer?: boolean;
  }
): Promise<{ order: AdminOrder; emailSent: boolean; emailError?: string }> {
  const session = await requireAdmin();
  const order = await loadOrderRow(orderId);

  const trackingNumber = (input.trackingNumber || '').replace(/[\s-]/g, '').toUpperCase();
  const trackingCarrier = (input.trackingCarrier || '').trim().slice(0, 40);

  if (trackingNumber && !TRACKING_RE.test(trackingNumber)) {
    throw new Error('Tracking number should be 6–40 letters and digits.');
  }
  if (trackingNumber && !trackingCarrier) {
    throw new Error('Choose the carrier for this tracking number.');
  }

  const alreadyShipped = order.status === 'shipped' || order.status === 'delivered';
  const shipNow = Boolean(input.markShipped) && !alreadyShipped;

  if (shipNow && !canTransition(order, 'shipped')) {
    throw new Error(transitionError(order, 'shipped'));
  }
  // Tracking may be added or corrected on any paid, live order.
  if (
    order.status === 'cancelled' ||
    order.paymentStatus === 'refunded' ||
    !isPaymentCaptured(order.paymentStatus)
  ) {
    throw new Error(transitionError(order, 'shipped'));
  }

  const trackingChanged =
    trackingNumber !== (order.trackingNumber || '') ||
    trackingCarrier !== (order.trackingCarrier || '');

  if (!shipNow && !trackingChanged) {
    return { order: toAdminOrder(order), emailSent: false };
  }

  const set: Partial<typeof orders.$inferInsert> = {
    trackingNumber: trackingNumber || null,
    trackingCarrier: trackingCarrier || null,
  };
  if (shipNow) {
    set.status = 'shipped';
    set.shippedAt = order.shippedAt || new Date();
  }

  const updated = await guardedUpdate(order, set);

  const parts: string[] = [];
  if (shipNow) parts.push(`Marked as shipped (was ${formatOrderStatus(order.status)}).`);
  if (trackingChanged) {
    parts.push(
      trackingNumber
        ? `Tracking ${order.trackingNumber ? 'changed to' : 'added:'} ${trackingCarrier} ${trackingNumber}.`
        : 'Tracking number removed.'
    );
  }

  let emailSent = false;
  let emailError: string | undefined;
  const numberIsNew = Boolean(trackingNumber) && trackingNumber !== (order.trackingNumber || '');
  if (input.notifyCustomer && trackingNumber && (shipNow || numberIsNew)) {
    try {
      const { sendShippingNotification } = await import('@/lib/email');
      const address = (updated.shippingAddress || {}) as ShippingAddressDB;
      const result = await sendShippingNotification({
        email: updated.email,
        customerName: `${address.firstName || ''} ${address.lastName || ''}`.trim() || 'there',
        orderId: updated.orderId,
        trackingNumber,
        carrier: trackingCarrier,
      });
      emailSent = result.success;
      if (!result.success) emailError = result.error || 'Email failed to send';
    } catch (error: any) {
      emailError = error?.message || 'Email failed to send';
    }
    parts.push(
      emailSent
        ? `Shipping confirmation emailed to ${updated.email}.`
        : `Shipping email failed: ${emailError}.`
    );
  }

  await addTimelineEntry(order.id, parts.join(' '), authorOf(session), emailSent);

  return { order: toAdminOrder(updated), emailSent, emailError };
}

/** Internal note on the order timeline (order_notes, never shown to customers). */
export async function addOrderNoteAction(orderId: string, note: string): Promise<AdminOrderNote> {
  const session = await requireAdmin();
  const text = (note || '').trim();
  if (!text) throw new Error('Note is empty');
  if (text.length > 5000) throw new Error('Note is too long (5000 characters max)');

  const order = await loadOrderRow(orderId);
  const db = getDb();
  const [row] = await db
    .insert(orderNotes)
    .values({ orderId: order.id, note: text, author: authorOf(session), customerNote: false })
    .returning();

  return {
    id: row.id,
    note: row.note,
    customerNote: row.customerNote,
    author: row.author,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Admin refund: issues a full Stripe refund (of whatever is not yet
 * refunded) and marks the order refunded. The charge.refunded webhook then
 * restocks inventory (idempotent).
 */
export async function refundOrderAction(orderId: string) {
  const session = await requireAdmin();
  const order = await loadOrderRow(orderId);

  if (!order.paymentIntentId) throw new Error('Order has no Stripe payment to refund');
  if (!isPaymentCaptured(order.paymentStatus)) {
    throw new Error(`Cannot refund an order with payment status "${order.paymentStatus}"`);
  }

  const { refundPaymentIntent } = await import('@/lib/stripe');
  const refund = await refundPaymentIntent(order.paymentIntentId);

  const shipped = order.status === 'shipped' || order.status === 'delivered';
  const db = getDb();
  const [flipped] = await db
    .update(orders)
    .set({
      paymentStatus: 'refunded',
      // An order that already left the building keeps its fulfilment status
      // (a return); an unshipped one is cancelled.
      ...(shipped ? {} : { status: 'cancelled' as const }),
      updatedAt: new Date(),
    })
    // Only the first transition into "refunded" counts, so a retried click
    // (or the webhook having got there first) cannot release the coupon twice.
    .where(and(eq(orders.id, order.id), ne(orders.paymentStatus, 'refunded')))
    .returning({ id: orders.id });

  // A fully refunded order gives its coupon use back. releaseCouponUse is
  // exactly once across this action, a retried click and the charge.refunded
  // webhook (lib/coupons.ts hold marker).
  if (flipped && order.couponCode) {
    await releaseCouponUse(order.couponCode, order.orderId);
  }

  // Recorded on the timeline instead of overwriting the order's notes field.
  await addTimelineEntry(
    order.id,
    `Refunded ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      (refund.amount ?? 0) / 100
    )} via Stripe (refund ${refund.id}).`,
    authorOf(session)
  );

  return { refundId: refund.id };
}

/** Admin cancel: only unpaid orders. Paid orders are refunded instead. */
export async function cancelOrderAction(orderId: string) {
  const session = await requireAdmin();
  const order = await loadOrderRow(orderId);

  if (!canTransition(order, 'cancelled')) {
    throw new Error(transitionError(order, 'cancelled'));
  }

  const updated = await guardedUpdate(order, { status: 'cancelled' });
  // An unpaid order holds its coupon use from checkout; cancelling it gives
  // the use back (once: a late payment that reopens the order takes it again).
  if (order.couponCode) await releaseCouponUse(order.couponCode, order.orderId);
  await addTimelineEntry(
    order.id,
    `Order cancelled (was ${formatOrderStatus(order.status)}).`,
    authorOf(session)
  );
  return toAdminOrder(updated);
}
