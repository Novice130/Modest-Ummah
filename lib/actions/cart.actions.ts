'use server';

import { getDb } from '@/lib/db';
import { carts } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import type { Cart, CartItem } from '@/types';
import { getSession } from './auth.actions';

function mapCart(c: any): Cart {
  return {
    id: c.id,
    created: c.createdAt.toISOString(),
    updated: c.updatedAt.toISOString(),
    user: c.userId,
    items: typeof c.items === 'string' ? c.items : JSON.stringify(c.items || []),
  };
}

export async function fetchUserCart(): Promise<Cart | null> {
  const session = await getSession();
  if (!session?.id) return null;

  const db = getDb();
  const [result] = await db.select().from(carts).where(eq(carts.userId, session.id)).limit(1);

  if (!result) return null;
  return mapCart(result);
}

export async function saveCartAction(items: CartItem[]) {
  const session = await getSession();
  if (!session?.id) throw new Error('Unauthorized');

  const db = getDb();
  const userId = session.id;

  const [existing] = await db.select().from(carts).where(eq(carts.userId, userId)).limit(1);

  if (existing) {
    const [updated] = await db.update(carts).set({ items: items as any, updatedAt: new Date() }).where(eq(carts.id, existing.id)).returning();
    return mapCart(updated);
  }

  const [created] = await db.insert(carts).values({ userId, items: items as any }).returning();
  return mapCart(created);
}
