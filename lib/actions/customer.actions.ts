'use server';

import { getDb } from '@/lib/db';
import { users, orders } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';
import { getSession } from './auth.actions';

export interface CustomerDetail {
  id: string;
  email: string;
  name: string;
  verified: boolean;
  createdAt: string;
  totalOrders: number;
  totalSpent: number;
  orders: Array<{
    id: string;
    orderId: string;
    createdAt: string;
    status: string;
    paymentStatus: string;
    total: number;
  }>;
}

/** Admin view of a single customer with their order history. */
export async function fetchCustomerDetail(id: string): Promise<CustomerDetail | null> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return null;

  const userOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, id))
    .orderBy(desc(orders.createdAt))
    .limit(50);

  const totalSpent = userOrders
    .filter((o) => o.paymentStatus === 'paid')
    .reduce((sum, o) => sum + parseFloat(o.total as string), 0);

  return {
    id: user.id,
    email: user.email,
    name: user.name || '',
    verified: user.verified || false,
    createdAt: user.createdAt.toISOString(),
    totalOrders: userOrders.length,
    totalSpent,
    orders: userOrders.map((o) => ({
      id: o.id,
      orderId: o.orderId,
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: parseFloat(o.total as string),
    })),
  };
}
