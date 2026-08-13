'use server';

import { getDb } from '@/lib/db';
import { coupons } from '@/lib/schema';
import { eq, ilike, or, and, desc, count, ne } from 'drizzle-orm';
import { getSession } from './auth.actions';

/**
 * Coupon CRUD for the admin panel. All actions require an admin session.
 * List/search/pagination follow the products page pattern.
 */

export type CouponType = 'percentage' | 'fixed';

export interface CouponInput {
  code: string;
  type: CouponType;
  amount: number;
  minSpend?: number | string | null;
  usageLimit?: number | string | null;
  expiresAt?: string | null;
  startsAt?: string | null;
  enabled: boolean;
  productIds?: string[];
  category?: string | null;
}

export interface AdminCoupon {
  id: string;
  code: string;
  type: CouponType;
  amount: number;
  minSpend: number | null;
  usageLimit: number | null;
  usageCount: number;
  expiresAt: string | null;
  startsAt: string | null;
  enabled: boolean;
  productIds: string[];
  category: string | null;
  createdAt: string;
}

function mapCoupon(row: any): AdminCoupon {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    amount: parseFloat(row.amount as string) || 0,
    minSpend: row.minSpend !== null && row.minSpend !== undefined ? parseFloat(row.minSpend as string) : null,
    usageLimit: row.usageLimit,
    usageCount: row.usageCount || 0,
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    startsAt: row.startsAt ? new Date(row.startsAt).toISOString() : null,
    enabled: row.enabled,
    productIds: row.productIds || [],
    category: row.category,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
  };
}

function cleanInput(input: CouponInput) {
  const code = (input.code || '').trim().toUpperCase();
  if (!code) throw new Error('Coupon code is required');
  if (!/^[A-Z0-9-]+$/.test(code)) {
    throw new Error('Coupon code may only contain letters, numbers, and dashes');
  }
  if (input.type !== 'percentage' && input.type !== 'fixed') {
    throw new Error('Coupon type must be percentage or fixed');
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }
  if (input.type === 'percentage' && amount > 100) {
    throw new Error('Percentage discount cannot exceed 100');
  }

  const minSpend = input.minSpend === null || input.minSpend === undefined || input.minSpend === '' 
    ? null
    : Number(input.minSpend);
  if (minSpend !== null && (!Number.isFinite(minSpend) || minSpend < 0)) {
    throw new Error('Minimum spend must be zero or more');
  }

  const usageLimit = input.usageLimit === null || input.usageLimit === undefined || input.usageLimit === ''
    ? null
    : Number(input.usageLimit);
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 0)) {
    throw new Error('Usage limit must be a whole number');
  }

  return {
    code,
    type: input.type,
    amount: String(Math.round(amount * 100) / 100),
    minSpend: minSpend === null ? null : String(minSpend),
    usageLimit,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    enabled: !!input.enabled,
    productIds: Array.isArray(input.productIds) ? input.productIds.filter(Boolean) : [],
    category: input.category && input.category.trim() ? input.category.trim() : null,
  };
}

export async function fetchCouponsAdmin(
  page = 1,
  limit = 25,
  opts: { search?: string } = {}
): Promise<{ items: AdminCoupon[]; totalItems: number; totalPages: number }> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const conditions: any[] = [];
  if (opts.search) {
    conditions.push(
      or(
        ilike(coupons.code, `%${opts.search}%`),
        ilike(coupons.category, `%${opts.search}%`)
      )
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const [countResult] = await db.select({ count: count() }).from(coupons).where(where);
  const rows = await db
    .select()
    .from(coupons)
    .where(where)
    .orderBy(desc(coupons.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const totalItems = countResult?.count || 0;
  return {
    items: rows.map(mapCoupon),
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / limit)),
  };
}

export async function createCouponAction(input: CouponInput): Promise<AdminCoupon> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const clean = cleanInput(input);
  const db = getDb();

  const [existing] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(ilike(coupons.code, clean.code))
    .limit(1);
  if (existing) {
    throw new Error(`Coupon "${clean.code}" already exists`);
  }

  const [row] = await db
    .insert(coupons)
    .values({ ...clean, usageCount: 0 })
    .returning();
  return mapCoupon(row);
}

export async function updateCouponAction(id: string, input: CouponInput): Promise<AdminCoupon> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const clean = cleanInput(input);
  const db = getDb();

  const [existing] = await db
    .select()
    .from(coupons)
    .where(eq(coupons.id, id))
    .limit(1);
  if (!existing) throw new Error('Coupon not found');

  const [clash] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(and(ilike(coupons.code, clean.code), ne(coupons.id, id)))
    .limit(1);
  if (clash) {
    throw new Error(`Coupon "${clean.code}" already exists`);
  }

  const [row] = await db
    .update(coupons)
    .set({ ...clean, updatedAt: new Date() })
    .where(eq(coupons.id, id))
    .returning();

  return mapCoupon(row);
}

export async function deleteCouponAction(id: string): Promise<void> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  await db.delete(coupons).where(eq(coupons.id, id));
}

export async function toggleCouponAction(id: string, enabled: boolean): Promise<void> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  await db
    .update(coupons)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(coupons.id, id));
}
