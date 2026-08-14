import { getDb } from '@/lib/db';
import { orders, products, type OrderSelect } from '@/lib/schema';
import { and, asc, desc, eq, gte, inArray, lte, or, ilike, sql, type SQL } from 'drizzle-orm';
import { toWooStatus } from '@/lib/woo/serialize';

/**
 * Query helpers shared by the /wp-json order and product routes.
 */

export const MAX_PER_PAGE = 100;
export const DEFAULT_PER_PAGE = 10;

export interface ListParams {
  page: number;
  perPage: number;
  order: 'asc' | 'desc';
  orderby: string;
  status: string[];
  after: Date | null;
  before: Date | null;
  modifiedAfter: Date | null;
  search: string | null;
  include: number[];
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseListParams(searchParams: URLSearchParams): ListParams {
  const rawPerPage = parseInt(searchParams.get('per_page') || '', 10);
  const rawPage = parseInt(searchParams.get('page') || '', 10);

  const statusParam =
    searchParams.getAll('status[]').length > 0
      ? searchParams.getAll('status[]')
      : (searchParams.get('status') || '').split(',');

  const include = (searchParams.get('include') || '')
    .split(',')
    .map((v) => parseInt(v, 10))
    .filter((n) => Number.isFinite(n));

  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    perPage: Number.isFinite(rawPerPage)
      ? Math.min(Math.max(rawPerPage, 1), MAX_PER_PAGE)
      : DEFAULT_PER_PAGE,
    order: searchParams.get('order') === 'asc' ? 'asc' : 'desc',
    orderby: searchParams.get('orderby') || 'date',
    status: statusParam.map((s) => s.trim()).filter(Boolean),
    after: parseDate(searchParams.get('after')),
    before: parseDate(searchParams.get('before')),
    modifiedAfter: parseDate(searchParams.get('modified_after')),
    search: searchParams.get('search'),
    include,
  };
}

/**
 * Map requested Woo statuses onto our enum.
 *
 * 'any' means every status. An unmapped status yields an empty set, which the
 * caller turns into an empty result rather than "everything" — a filter that
 * silently widens is how unpaid orders would leak into a label queue.
 */
function ourStatusesFor(wooStatuses: string[]): string[] | 'any' | null {
  if (wooStatuses.length === 0) return 'any';
  if (wooStatuses.includes('any')) return 'any';

  const mapped = new Set<string>();
  for (const status of wooStatuses) {
    switch (status) {
      case 'pending':
        mapped.add('pending');
        mapped.add('pending_payment');
        break;
      case 'processing':
        mapped.add('processing');
        break;
      case 'completed':
        mapped.add('shipped');
        mapped.add('delivered');
        break;
      case 'cancelled':
      case 'failed':
      case 'refunded':
        mapped.add('cancelled');
        break;
      default:
        break;
    }
  }

  return mapped.size > 0 ? [...mapped] : null;
}

/**
 * Build the WHERE clause for an orders listing.
 *
 * The paid-only condition is not optional and is not derived from any request
 * parameter: orders are inserted *before* payment with status
 * 'pending_payment', and an unpaid row must never reach a label queue.
 */
function ordersWhere(params: ListParams): SQL | undefined {
  const conditions: SQL[] = [eq(orders.paymentStatus, 'paid')];

  const statuses = ourStatusesFor(params.status);
  if (statuses === null) {
    // Requested a status we can never satisfy — match nothing.
    return sql`false`;
  }
  if (statuses !== 'any') {
    conditions.push(inArray(orders.status, statuses as OrderSelect['status'][]));
  }

  if (params.after) conditions.push(gte(orders.createdAt, params.after));
  if (params.before) conditions.push(lte(orders.createdAt, params.before));
  if (params.modifiedAfter) conditions.push(gte(orders.updatedAt, params.modifiedAfter));
  if (params.include.length > 0) conditions.push(inArray(orders.wooId, params.include));

  if (params.search) {
    const term = `%${params.search}%`;
    const searchCondition = or(
      ilike(orders.email, term),
      ilike(orders.orderId, term)
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  return and(...conditions);
}

export async function listOrders(params: ListParams): Promise<{
  rows: OrderSelect[];
  total: number;
  totalPages: number;
}> {
  const db = getDb();
  const where = ordersWhere(params);

  const direction = params.order === 'asc' ? asc : desc;
  const sortColumn =
    params.orderby === 'modified'
      ? orders.updatedAt
      : params.orderby === 'id'
      ? orders.wooId
      : orders.createdAt;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(where);

  const total = countRow?.count ?? 0;
  const totalPages = params.perPage > 0 ? Math.ceil(total / params.perPage) : 0;

  const rows = await db
    .select()
    .from(orders)
    .where(where)
    .orderBy(direction(sortColumn))
    .limit(params.perPage)
    .offset((params.page - 1) * params.perPage);

  return { rows, total, totalPages };
}

export async function findOrderByWooId(wooId: number): Promise<OrderSelect | null> {
  const db = getDb();
  const [row] = await db.select().from(orders).where(eq(orders.wooId, wooId)).limit(1);
  return row || null;
}

/**
 * Resolve productId (uuid) → wooProductId (int) for the line items of a set of
 * orders, so line_items[].product_id dereferences against /products/{id}.
 */
export async function productWooIdMap(
  orderRows: OrderSelect[]
): Promise<Map<string, number>> {
  const ids = new Set<string>();
  for (const order of orderRows) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      if (item.productId) ids.add(item.productId);
    }
  }

  if (ids.size === 0) return new Map();

  const db = getDb();
  const rows = await db
    .select({ id: products.id, wooProductId: products.wooProductId })
    .from(products)
    .where(inArray(products.id, [...ids]));

  return new Map(rows.map((r) => [r.id, r.wooProductId]));
}

export function wooStatusOf(order: OrderSelect): string {
  return toWooStatus(order);
}
