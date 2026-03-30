'use server';

import { getDb } from '@/lib/db';
import { orders } from '@/lib/schema';
import { eq, desc, and, like, or, count } from 'drizzle-orm';
import type { Order } from '@/types';
import { getSession } from './auth.actions';

function mapOrder(o: any): Order {
  return {
    id: o.id,
    collectionId: 'orders',
    collectionName: 'orders',
    created: o.createdAt.toISOString(),
    updated: o.updatedAt.toISOString(),
    orderId: o.orderId,
    user: o.userId || undefined,
    email: o.email,
    items: JSON.stringify(o.items || []),
    subtotal: parseFloat(o.subtotal as string),
    shipping: parseFloat(o.shipping as string),
    tax: parseFloat(o.tax as string),
    total: parseFloat(o.total as string),
    status: o.status as any,
    paymentStatus: o.paymentStatus as any,
    paymentIntentId: o.paymentIntentId || undefined,
    shippingAddress: (o.shippingAddress || {}) as any,
    billingAddress: o.billingAddress as any,
    notes: o.notes || undefined,
  };
}

export async function createOrderAction(orderData: Partial<Order>) {
  const db = getDb();

  const [created] = await db
    .insert(orders)
    .values({
      orderId: orderData.orderId!,
      userId: orderData.user || null,
      email: orderData.email!,
      items: typeof orderData.items === 'string' ? JSON.parse(orderData.items) : orderData.items || [],
      subtotal: String(orderData.subtotal || 0),
      shipping: String(orderData.shipping || 0),
      tax: String(orderData.tax || 0),
      total: String(orderData.total || 0),
      status: (orderData.status as any) || 'pending',
      paymentStatus: (orderData.paymentStatus as any) || 'pending',
      paymentIntentId: orderData.paymentIntentId,
      shippingAddress: (typeof orderData.shippingAddress === 'string'
        ? JSON.parse(orderData.shippingAddress)
        : orderData.shippingAddress) as any,
      billingAddress: orderData.billingAddress
        ? (typeof orderData.billingAddress === 'string'
          ? JSON.parse(orderData.billingAddress)
          : orderData.billingAddress) as any
        : null,
      notes: orderData.notes,
    })
    .returning();

  return mapOrder(created);
}

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

export async function fetchOrderById(orderId: string): Promise<Order | null> {
  const db = getDb();

  let [result] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);

  if (!result) {
    [result] = await db.select().from(orders).where(eq(orders.orderId, orderId)).limit(1);
  }

  if (!result) return null;
  return mapOrder(result);
}

export async function updateOrderAction(orderId: string, data: Partial<Order>) {
  const session = await getSession(true); // Must be admin
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const updateData: any = { updatedAt: new Date() };
  if (data.status) updateData.status = data.status;
  if (data.paymentStatus) updateData.paymentStatus = data.paymentStatus;
  if (data.paymentIntentId) updateData.paymentIntentId = data.paymentIntentId;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const [updated] = await db.update(orders).set(updateData).where(eq(orders.id, orderId)).returning();

  if (!updated) throw new Error('Order not found');
  return mapOrder(updated);
}

// Admin only
export async function fetchAllOrdersAdmin({ page = 1, limit = 50, filter = '' } = {}) {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const offset = (page - 1) * limit;

  let where: any = undefined;
  if (filter && filter.trim()) {
    const emailMatch = filter.match(/email~"([^"]+)"/);
    const orderIdMatch = filter.match(/orderId~"([^"]+)"/);
    const conditions = [];
    if (emailMatch) conditions.push(like(orders.email, `%${emailMatch[1]}%`));
    if (orderIdMatch) conditions.push(like(orders.orderId, `%${orderIdMatch[1]}%`));
    if (conditions.length > 0) where = or(...conditions);
  }

  const [countResult] = await db.select({ count: count() }).from(orders).where(where);
  const items = await db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(limit).offset(offset);

  return {
    items: items.map(mapOrder),
    totalItems: countResult?.count || 0,
    totalPages: Math.ceil((countResult?.count || 0) / limit),
    page,
    limit,
  };
}
