import { orders } from '@/lib/schema';
import { and, or, eq, ne, inArray, ilike, gte, lte, sql, type SQL } from 'drizzle-orm';
import { PAYMENT_STATUSES, type OrderListFilters, type OrderListTab, type PaymentStatusValue } from '@/lib/order-status';

/**
 * WHERE-clause builder shared by the admin order list and the CSV export, so
 * "export all" exports exactly the rows the admin is filtering on (every
 * page, not just the page in memory). Lives outside the 'use server' actions
 * file so it is not exposed as a callable Server Action.
 */

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function tabCondition(tab: OrderListTab): SQL | undefined {
  switch (tab) {
    case 'all':
      // Abandoned / unpaid checkouts are not orders yet. Every checkout that
      // reaches the payment step inserts a row, so they used to bury real
      // orders in the default view. They have their own tab.
      return ne(orders.status, 'pending_payment');
    case 'unfulfilled':
      return inArray(orders.status, ['pending', 'processing']);
    case 'shipped':
    case 'delivered':
    case 'cancelled':
    case 'pending_payment':
      return eq(orders.status, tab);
    default:
      return undefined;
  }
}

export function buildOrderFilter(filters: OrderListFilters, includeTab = true): SQL | undefined {
  const conditions: SQL[] = [];

  if (includeTab && filters.tab) {
    const c = tabCondition(filters.tab);
    if (c) conditions.push(c);
  }

  if (
    filters.paymentStatus &&
    (PAYMENT_STATUSES as readonly string[]).includes(filters.paymentStatus)
  ) {
    conditions.push(eq(orders.paymentStatus, filters.paymentStatus as PaymentStatusValue));
  }

  const from = filters.dateFrom ? new Date(filters.dateFrom) : null;
  if (from && !Number.isNaN(from.getTime())) conditions.push(gte(orders.createdAt, from));
  const to = filters.dateTo ? new Date(filters.dateTo) : null;
  if (to && !Number.isNaN(to.getTime())) conditions.push(lte(orders.createdAt, to));

  const search = (filters.search || '').trim().slice(0, 100);
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    const match = or(
      ilike(orders.orderId, pattern),
      ilike(orders.email, pattern),
      ilike(orders.trackingNumber, pattern),
      sql`concat_ws(' ', ${orders.shippingAddress}->>'firstName', ${orders.shippingAddress}->>'lastName') ilike ${pattern}`,
      // The Woo-compatible id Pirate Ship shows as the order number.
      /^\d{1,9}$/.test(search) ? eq(orders.wooId, parseInt(search, 10)) : undefined
    );
    if (match) conditions.push(match);
  }

  return conditions.length ? and(...conditions) : undefined;
}
