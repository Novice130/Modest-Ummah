'use server';

import { getDb } from '@/lib/db';
import { users, orders, settings } from '@/lib/schema';
import { and, asc, count, desc, eq, ilike, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { placedOrderCondition, revenueOrderCondition } from '@/lib/admin-helpers';
import { normalizeAddress } from '@/lib/address';
import type { ShippingAddressDB } from '@/lib/schema';

/**
 * Admin customer views. Every export re-checks the admin session: these are
 * reachable by direct POST regardless of the page that imports them.
 *
 * Order metrics follow the dashboard's definitions (lib/admin-helpers.ts):
 * "orders" are orders that were paid at some point (abandoned checkouts and
 * failed payments excluded), "spend" is paid orders that were not cancelled or
 * fully refunded. A customer's orders are the ones placed while signed in plus
 * guest checkouts made with the same email address.
 */

async function requireAdmin() {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');
  return session;
}

/** Escape LIKE wildcards so a search for "50%" matches literally. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * created_at is `timestamp without time zone` holding UTC. Raw sql aggregates
 * bypass Drizzle's column mapping, so format them as ISO-8601 UTC in SQL rather
 * than letting `new Date("2026-10-01 12:00:00")` guess a local zone.
 */
function isoUtc(expr: SQL): SQL<string | null> {
  return sql<string | null>`to_char(${expr}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

/** Join condition: orders belonging to the user row in scope. */
function ordersOfUser(): SQL {
  return or(
    eq(orders.userId, users.id),
    and(isNull(orders.userId), sql`lower(${orders.email}) = lower(${users.email})`)
  ) as SQL;
}

// ─── List ───────────────────────────────────────────────

export type CustomerSort = 'newest' | 'oldest' | 'name' | 'orders' | 'spent' | 'lastOrder';

export interface CustomerListItem {
  id: string;
  email: string;
  name: string;
  verified: boolean;
  authProvider: string;
  createdAt: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

export interface CustomerListResult {
  items: CustomerListItem[];
  totalItems: number;
  totalPages: number;
  page: number;
  perPage: number;
}

export async function fetchCustomersAdmin(
  params: { page?: number; perPage?: number; search?: string; sort?: CustomerSort } = {}
): Promise<CustomerListResult> {
  await requireAdmin();

  const perPage = Math.min(Math.max(Math.floor(params.perPage || 25), 1), 100);
  const page = Math.max(Math.floor(params.page || 1), 1);
  const search = (params.search || '').trim().slice(0, 200);

  const where = search
    ? or(ilike(users.email, likePattern(search)), ilike(users.name, likePattern(search)))
    : undefined;

  const totalOrders = sql<number>`(COUNT(${orders.id}) FILTER (WHERE ${placedOrderCondition()}))::int`;
  const totalSpent = sql<string>`COALESCE(SUM(${orders.total}) FILTER (WHERE ${revenueOrderCondition()}), 0)`;
  const lastOrderRaw = sql`MAX(${orders.createdAt}) FILTER (WHERE ${placedOrderCondition()})`;
  const lastOrderAt = isoUtc(lastOrderRaw);

  const orderBy = (() => {
    switch (params.sort) {
      case 'oldest':
        return [asc(users.createdAt)];
      case 'name':
        return [asc(sql`lower(coalesce(nullif(${users.name}, ''), ${users.email}))`)];
      case 'orders':
        return [desc(totalOrders), desc(users.createdAt)];
      case 'spent':
        return [desc(totalSpent), desc(users.createdAt)];
      case 'lastOrder':
        return [sql`${lastOrderRaw} DESC NULLS LAST`, desc(users.createdAt)];
      case 'newest':
      default:
        return [desc(users.createdAt)];
    }
  })();

  const db = getDb();
  const [[countRow], rows] = await Promise.all([
    db.select({ count: count() }).from(users).where(where),
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        verified: users.verified,
        authProvider: users.authProvider,
        createdAt: users.createdAt,
        totalOrders,
        totalSpent,
        lastOrderAt,
      })
      .from(users)
      .leftJoin(orders, ordersOfUser())
      .where(where)
      .groupBy(users.id)
      .orderBy(...orderBy)
      .limit(perPage)
      .offset((page - 1) * perPage),
  ]);

  const totalItems = countRow?.count ?? 0;
  return {
    items: rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name || '',
      verified: u.verified ?? false,
      authProvider: u.authProvider || 'email',
      createdAt: u.createdAt.toISOString(),
      totalOrders: Number(u.totalOrders) || 0,
      totalSpent: parseFloat(String(u.totalSpent)) || 0,
      lastOrderAt: u.lastOrderAt || null,
    })),
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / perPage)),
    page,
    perPage,
  };
}

// ─── Detail ─────────────────────────────────────────────

export interface CustomerDetail {
  id: string;
  email: string;
  name: string;
  verified: boolean;
  authProvider: string;
  createdAt: string;
  phone: string;
  /** Orders paid at some point (see module comment). */
  totalOrders: number;
  /** Paid, not cancelled/refunded. */
  totalSpent: number;
  averageOrderValue: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  /** Checkouts started but never paid (abandoned or failed). Not listed. */
  unpaidCheckouts: number;
  /** Distinct shipping addresses used, most recent first. */
  addresses: ShippingAddressDB[];
  orders: Array<{
    id: string;
    orderId: string;
    createdAt: string;
    status: string;
    paymentStatus: string;
    total: number;
    itemCount: number;
    guest: boolean;
  }>;
}

const ORDER_HISTORY_LIMIT = 100;

/** Admin view of a single customer with their order history. */
export async function fetchCustomerDetail(id: string): Promise<CustomerDetail | null> {
  await requireAdmin();

  // uuid column: a malformed id would be a Postgres error, not "not found".
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return null;

  const db = getDb();
  // Explicit columns: password_hash and provider ids never leave the server.
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      verified: users.verified,
      authProvider: users.authProvider,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) return null;

  const mine = or(
    eq(orders.userId, user.id),
    and(isNull(orders.userId), sql`lower(${orders.email}) = lower(${user.email})`)
  );

  const [[agg], placedRows] = await Promise.all([
    db
      .select({
        totalOrders: sql<number>`(COUNT(*) FILTER (WHERE ${placedOrderCondition()}))::int`,
        revenueOrders: sql<number>`(COUNT(*) FILTER (WHERE ${revenueOrderCondition()}))::int`,
        totalSpent: sql<string>`COALESCE(SUM(${orders.total}) FILTER (WHERE ${revenueOrderCondition()}), 0)`,
        firstOrderAt: isoUtc(sql`MIN(${orders.createdAt}) FILTER (WHERE ${placedOrderCondition()})`),
        lastOrderAt: isoUtc(sql`MAX(${orders.createdAt}) FILTER (WHERE ${placedOrderCondition()})`),
        unpaid: sql<number>`(COUNT(*) FILTER (WHERE NOT (${placedOrderCondition()})))::int`,
      })
      .from(orders)
      .where(mine),
    db
      .select({
        id: orders.id,
        orderId: orders.orderId,
        userId: orders.userId,
        createdAt: orders.createdAt,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        total: orders.total,
        items: orders.items,
        shippingAddress: orders.shippingAddress,
      })
      .from(orders)
      .where(and(mine, placedOrderCondition()))
      .orderBy(desc(orders.createdAt))
      .limit(ORDER_HISTORY_LIMIT),
  ]);

  // Distinct addresses, newest first. Key on the fields that make an address
  // a different destination, case- and whitespace-insensitive.
  const seen = new Set<string>();
  const addresses: ShippingAddressDB[] = [];
  let phone = '';
  for (const row of placedRows) {
    const addr = normalizeAddress(row.shippingAddress);
    if (!phone && addr.phone) phone = addr.phone;
    if (!addr.address1) continue;
    const key = [addr.firstName, addr.lastName, addr.address1, addr.address2, addr.city, addr.state, addr.postalCode, addr.country]
      .map((v) => String(v || '').trim().toLowerCase())
      .join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    if (addresses.length < 5) addresses.push(addr);
  }

  const totalSpent = parseFloat(String(agg?.totalSpent ?? '0')) || 0;
  const revenueOrders = Number(agg?.revenueOrders) || 0;

  return {
    id: user.id,
    email: user.email,
    name: user.name || '',
    verified: user.verified ?? false,
    authProvider: user.authProvider || 'email',
    createdAt: user.createdAt.toISOString(),
    phone,
    totalOrders: Number(agg?.totalOrders) || 0,
    totalSpent,
    averageOrderValue: revenueOrders > 0 ? totalSpent / revenueOrders : 0,
    firstOrderAt: agg?.firstOrderAt || null,
    lastOrderAt: agg?.lastOrderAt || null,
    unpaidCheckouts: Number(agg?.unpaid) || 0,
    addresses,
    orders: placedRows.map((o) => ({
      id: o.id,
      orderId: o.orderId,
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: parseFloat(o.total as string) || 0,
      itemCount: (o.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
      guest: o.userId === null,
    })),
  };
}

// ─── Newsletter subscribers & contact messages ──────────
//
// Both forms store their submissions in the key/value settings table
// (lib/actions/newsletter.actions.ts, lib/actions/contact.actions.ts); no
// email is sent. These are the only admin views of them.

const INBOX_LIMIT = 500;

export interface NewsletterSubscriber {
  email: string;
  subscribedAt: string;
}

export async function fetchNewsletterSubscribersAdmin(): Promise<{
  items: NewsletterSubscriber[];
  total: number;
}> {
  await requireAdmin();

  const db = getDb();
  const where = like(settings.key, 'newsletter:%');
  const [[countRow], rows] = await Promise.all([
    db.select({ count: count() }).from(settings).where(where),
    db
      .select({ key: settings.key, value: settings.value, updatedAt: settings.updatedAt })
      .from(settings)
      .where(where)
      .orderBy(desc(settings.updatedAt))
      .limit(INBOX_LIMIT),
  ]);

  const items = rows
    .map((row) => {
      const value = (row.value || {}) as Record<string, unknown>;
      return {
        email: typeof value.email === 'string' ? value.email : row.key.slice('newsletter:'.length),
        subscribedAt:
          typeof value.subscribedAt === 'string' ? value.subscribedAt : row.updatedAt.toISOString(),
      };
    })
    .sort((a, b) => b.subscribedAt.localeCompare(a.subscribedAt));

  return { items, total: countRow?.count ?? 0 };
}

/** Remove a subscriber (e.g. an unsubscribe request). */
export async function removeNewsletterSubscriberAction(email: string): Promise<void> {
  await requireAdmin();
  const clean = (email || '').trim().toLowerCase();
  if (!clean) throw new Error('Email is required');
  const db = getDb();
  await db.delete(settings).where(eq(settings.key, `newsletter:${clean}`));
}

export interface ContactMessage {
  /** settings.key — `contact:<timestamp>`. */
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  receivedAt: string;
}

export async function fetchContactMessagesAdmin(): Promise<{
  items: ContactMessage[];
  total: number;
}> {
  await requireAdmin();

  const db = getDb();
  const where = like(settings.key, 'contact:%');
  const [[countRow], rows] = await Promise.all([
    db.select({ count: count() }).from(settings).where(where),
    db
      .select({ key: settings.key, value: settings.value, updatedAt: settings.updatedAt })
      .from(settings)
      .where(where)
      .orderBy(desc(settings.updatedAt))
      .limit(INBOX_LIMIT),
  ]);

  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const items = rows
    .map((row) => {
      const value = (row.value || {}) as Record<string, unknown>;
      return {
        id: row.key,
        name: `${str(value.firstName)} ${str(value.lastName)}`.trim(),
        email: str(value.email),
        subject: str(value.subject),
        message: str(value.message),
        receivedAt: str(value.receivedAt) || row.updatedAt.toISOString(),
      };
    })
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  return { items, total: countRow?.count ?? 0 };
}

export async function deleteContactMessageAction(id: string): Promise<void> {
  await requireAdmin();
  // Only ever delete contact rows: the key comes from the client.
  if (!/^contact:\d+$/.test(id || '')) throw new Error('Invalid message id');
  const db = getDb();
  await db.delete(settings).where(eq(settings.key, id));
}
