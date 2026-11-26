'use server';

import { getDb } from '@/lib/db';
import { categories, coupons, products } from '@/lib/schema';
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { normalizeCouponCode } from '@/lib/coupons';
import { getSession } from '@/lib/session';

/**
 * Coupon CRUD for the admin panel. All actions require an admin session.
 * List/search/pagination follow the products page pattern.
 *
 * Money is dollars everywhere (numeric(10,2) in the DB, dollars in
 * lib/pricing.ts and lib/coupons.ts). Times are absolute instants: the form
 * sends ISO strings built in the admin's browser timezone, and the columns
 * hold UTC.
 */

export type CouponType = 'percentage' | 'fixed';

export type CouponStatus = 'active' | 'scheduled' | 'expired' | 'used_up' | 'disabled';

export interface CouponInput {
  code: string;
  type: CouponType;
  amount: number;
  minSpend?: number | string | null;
  usageLimit?: number | string | null;
  /** ISO instant, or null for no end. */
  expiresAt?: string | null;
  /** ISO instant, or null to start immediately. */
  startsAt?: string | null;
  enabled: boolean;
  /** Restrict to these products. Mutually exclusive with categoryId. */
  productIds?: string[];
  /** Restrict to this category and everything beneath it. */
  categoryId?: string | null;
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
  /** Names for productIds, in the same order; deleted products are dropped. */
  products: Array<{ id: string; name: string }>;
  categoryId: string | null;
  categoryName: string | null;
  createdAt: string;
  updatedAt: string;
}

const MAX_CODE_LENGTH = 40;

function iso(value: unknown): string | null {
  return value ? new Date(value as string).toISOString() : null;
}

function mapCoupon(
  row: typeof coupons.$inferSelect,
  extra: { categoryName: string | null; productNames: Map<string, string> }
): AdminCoupon {
  const productIds = (row.productIds || []).filter(Boolean);
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    amount: parseFloat(row.amount as string) || 0,
    minSpend:
      row.minSpend !== null && row.minSpend !== undefined
        ? parseFloat(row.minSpend as string)
        : null,
    usageLimit: row.usageLimit,
    usageCount: row.usageCount || 0,
    expiresAt: iso(row.expiresAt),
    startsAt: iso(row.startsAt),
    enabled: row.enabled,
    productIds,
    products: productIds
      .filter((id) => extra.productNames.has(id))
      .map((id) => ({ id, name: extra.productNames.get(id)! })),
    categoryId: row.categoryId,
    categoryName: extra.categoryName,
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updatedAt) ?? iso(row.createdAt) ?? new Date(0).toISOString(),
  };
}

/** Resolves category and product names for a page of coupon rows in two queries. */
async function hydrate(rows: Array<typeof coupons.$inferSelect>): Promise<AdminCoupon[]> {
  const db = getDb();
  const categoryIds = [...new Set(rows.map((r) => r.categoryId).filter(Boolean))] as string[];
  const productIds = [
    ...new Set(rows.flatMap((r) => (r.productIds || []).filter(Boolean))),
  ];

  const [categoryRows, productRows] = await Promise.all([
    categoryIds.length
      ? db
          .select({ id: categories.id, name: categories.name })
          .from(categories)
          .where(inArray(categories.id, categoryIds))
      : Promise.resolve([]),
    productIds.length
      ? db
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(inArray(products.id, productIds))
      : Promise.resolve([]),
  ]);

  const categoryNames = new Map(categoryRows.map((c) => [c.id, c.name]));
  const productNames = new Map(productRows.map((p) => [p.id, p.name]));

  return rows.map((row) =>
    mapCoupon(row, {
      categoryName: row.categoryId ? categoryNames.get(row.categoryId) ?? null : null,
      productNames,
    })
  );
}

function parseInstant(value: string | null | undefined, label: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`${label} is not a valid date`);
  return d;
}

function blank(v: unknown) {
  return v === null || v === undefined || v === '';
}

async function cleanInput(input: CouponInput) {
  const code = normalizeCouponCode(input.code || '');
  if (!code) throw new Error('Coupon code is required');
  if (!/^[A-Z0-9-]+$/.test(code)) {
    throw new Error('Coupon code may only contain letters, numbers, and dashes');
  }
  if (code.length > MAX_CODE_LENGTH) {
    throw new Error(`Coupon code must be ${MAX_CODE_LENGTH} characters or fewer`);
  }
  if (input.type !== 'percentage' && input.type !== 'fixed') {
    throw new Error('Coupon type must be percentage or fixed');
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount)) throw new Error('Discount amount is required');
  if (input.type === 'percentage') {
    if (amount < 1 || amount > 100) {
      throw new Error('Percentage discount must be between 1 and 100');
    }
  } else if (amount <= 0) {
    throw new Error('Fixed discount must be more than $0');
  }
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    throw new Error('Discount amount can have at most 2 decimal places');
  }

  const minSpend = blank(input.minSpend) ? null : Number(input.minSpend);
  if (minSpend !== null && (!Number.isFinite(minSpend) || minSpend < 0)) {
    throw new Error('Minimum order subtotal must be zero or more');
  }

  const usageLimit = blank(input.usageLimit) ? null : Number(input.usageLimit);
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) {
    // 0 would create a coupon that is "used up" before anyone can redeem it.
    throw new Error('Usage limit must be a whole number of 1 or more (leave empty for unlimited)');
  }

  const startsAt = parseInstant(input.startsAt, 'Start date');
  const expiresAt = parseInstant(input.expiresAt, 'End date');
  if (startsAt && expiresAt && expiresAt <= startsAt) {
    throw new Error('End date must be after the start date');
  }

  const productIds = Array.isArray(input.productIds)
    ? [...new Set(input.productIds.filter(Boolean))]
    : [];
  const categoryId = input.categoryId && input.categoryId.trim() ? input.categoryId.trim() : null;

  // lib/coupons.ts checks productIds first and ignores the category when
  // both are set, so accepting both would show the admin a rule checkout
  // never applies.
  if (productIds.length > 0 && categoryId) {
    throw new Error('Restrict the coupon to products or to a category, not both');
  }

  const db = getDb();
  if (categoryId) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);
    if (!cat) throw new Error('The selected category no longer exists');
  }
  if (productIds.length > 0) {
    const found = await db
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.id, productIds));
    if (found.length !== productIds.length) {
      throw new Error('One or more selected products no longer exist');
    }
  }

  return {
    code,
    type: input.type,
    amount: amount.toFixed(2),
    minSpend: minSpend === null ? null : minSpend.toFixed(2),
    usageLimit,
    expiresAt,
    startsAt,
    enabled: !!input.enabled,
    productIds,
    categoryId,
  };
}

async function assertCodeFree(code: string, excludeId?: string) {
  const db = getDb();
  const conditions = [sql`upper(${coupons.code}) = ${code}`];
  if (excludeId) conditions.push(ne(coupons.id, excludeId));
  const [clash] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(and(...conditions))
    .limit(1);
  if (clash) throw new Error(`Coupon "${code}" already exists`);
}

/** Escapes LIKE wildcards so a search for "10%" means the literal text. */
function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * SQL for each status, matching the precedence the admin list shows:
 * disabled > expired > scheduled > used up > active.
 */
function statusCondition(status: CouponStatus, now: Date) {
  const notExpired = or(isNull(coupons.expiresAt), gt(coupons.expiresAt, now));
  const started = or(isNull(coupons.startsAt), lte(coupons.startsAt, now));
  const limitReached = and(
    isNotNull(coupons.usageLimit),
    gte(coupons.usageCount, coupons.usageLimit)
  );
  const limitOpen = or(isNull(coupons.usageLimit), lt(coupons.usageCount, coupons.usageLimit));
  switch (status) {
    case 'disabled':
      return eq(coupons.enabled, false);
    case 'expired':
      return and(eq(coupons.enabled, true), lte(coupons.expiresAt, now));
    case 'scheduled':
      return and(eq(coupons.enabled, true), notExpired, gt(coupons.startsAt, now));
    case 'used_up':
      return and(eq(coupons.enabled, true), notExpired, started, limitReached);
    case 'active':
      return and(eq(coupons.enabled, true), notExpired, started, limitOpen);
  }
}

export async function fetchCouponsAdmin(
  page = 1,
  limit = 25,
  opts: { search?: string; status?: CouponStatus | 'all' } = {}
): Promise<{ items: AdminCoupon[]; totalItems: number; totalPages: number }> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const db = getDb();
  const conditions: any[] = [];
  const q = opts.search?.trim();
  if (q) {
    const pattern = likePattern(q);
    conditions.push(
      or(
        ilike(coupons.code, pattern),
        // Match on the restricted category's name too.
        sql`EXISTS (
          SELECT 1 FROM categories c
          WHERE c.id = ${coupons.categoryId}
            AND c.name ILIKE ${pattern}
        )`
      )
    );
  }
  if (opts.status && opts.status !== 'all') {
    conditions.push(statusCondition(opts.status, new Date()));
  }

  const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 25), 100);
  const safePage = Math.max(1, Math.floor(page) || 1);
  const where = conditions.length ? and(...conditions) : undefined;
  const [countResult] = await db.select({ count: count() }).from(coupons).where(where);
  const rows = await db
    .select()
    .from(coupons)
    .where(where)
    .orderBy(desc(coupons.createdAt))
    .limit(safeLimit)
    .offset((safePage - 1) * safeLimit);

  const totalItems = Number(countResult?.count) || 0;
  return {
    items: await hydrate(rows),
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / safeLimit)),
  };
}

export async function createCouponAction(input: CouponInput): Promise<AdminCoupon> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const clean = await cleanInput(input);
  await assertCodeFree(clean.code);

  const db = getDb();
  const [row] = await db
    .insert(coupons)
    .values({ ...clean, usageCount: 0 })
    .returning();
  const [mapped] = await hydrate([row]);
  return mapped;
}

export async function updateCouponAction(id: string, input: CouponInput): Promise<AdminCoupon> {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');

  const clean = await cleanInput(input);
  const db = getDb();

  const [existing] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(eq(coupons.id, id))
    .limit(1);
  if (!existing) throw new Error('Coupon not found');

  await assertCodeFree(clean.code, id);

  const [row] = await db
    .update(coupons)
    .set({ ...clean, updatedAt: new Date() })
    .where(eq(coupons.id, id))
    .returning();

  const [mapped] = await hydrate([row]);
  return mapped;
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
  const rows = await db
    .update(coupons)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(coupons.id, id))
    .returning({ id: coupons.id });
  if (rows.length === 0) throw new Error('Coupon not found');
}
