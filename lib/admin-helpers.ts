import { getDb } from './db';
import { orders, products, productVariants, users } from './schema';
import { sql, eq, ne, desc, count, and, gte, lt, inArray, type SQL } from 'drizzle-orm';
import type { OrderItem, ShippingAddressDB } from './schema';

// ─── Order classification ───────────────────────────────
//
// Every checkout attempt inserts an order row (status pending_payment) before
// the customer pays, so "all rows in orders" includes abandoned checkouts and
// failed cards. Admin metrics use these two predicates instead, so the
// dashboard, the customer list and the customer detail agree on one number.

/**
 * Orders the customer actually paid for at some point: paid, partially
 * refunded, or refunded afterwards. Abandoned checkouts (pending) and failed
 * payments are excluded. Use for order counts and status breakdowns.
 */
export function placedOrderCondition(): SQL {
  return inArray(orders.paymentStatus, ['paid', 'partial', 'refunded']);
}

/**
 * Orders that count towards revenue / lifetime spend: payment captured and not
 * fully refunded, and the order not cancelled. A partial refund keeps the
 * order in (the schema has no refunded-amount column, so the gross total is
 * counted).
 */
export function revenueOrderCondition(): SQL {
  return and(
    inArray(orders.paymentStatus, ['paid', 'partial']),
    ne(orders.status, 'cancelled')
  ) as SQL;
}

// ─── Dashboard Stats ────────────────────────────────────

export interface DashboardStats {
  /** All-time revenue (paid, not cancelled/refunded). */
  totalRevenue: number;
  /** All-time placed (paid at some point) orders. */
  totalOrders: number;
  /** All registered customer accounts. */
  totalCustomers: number;
  /** All products, any status. */
  totalProducts: number;
  /** Revenue, last 30 days. */
  revenue30: number;
  /** Placed orders, last 30 days. */
  orders30: number;
  /** Accounts created, last 30 days. */
  newCustomers30: number;
  /** revenue30 / revenue orders in the last 30 days. */
  averageOrderValue30: number;
  /** % change of the 30-day figure vs the 30 days before it (null = no prior data). */
  revenueChange: number | null;
  ordersChange: number | null;
  customersChange: number | null;
  averageOrderValueChange: number | null;
  /** Paid orders still waiting to ship (pending/processing). */
  ordersToFulfil: number;
  /** Checkouts started in the last 30 days that never got paid. */
  abandonedCheckouts30: number;
  recentOrders: RecentOrder[];
  mostSoldItems: MostSoldItem[];
  ordersByStatus: StatusCount[];
  revenueByMonth: MonthlyRevenue[];
  lowStock: LowStockItem[];
  /** Total low-stock rows (lowStock holds at most 10). */
  lowStockCount: number;
}

export interface RecentOrder {
  id: string;
  orderId: string;
  email: string;
  customerName: string;
  total: number;
  status: string;
  paymentStatus: string;
  createdAt: Date;
}

export interface MostSoldItem {
  name: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface MonthlyRevenue {
  /** Short month label, e.g. "Oct". */
  month: string;
  /** YYYY-MM (UTC). */
  key: string;
  revenue: number;
  orders: number;
}

export interface LowStockItem {
  id: string;
  name: string;
  /** Variant attributes ("Size: M, Color: Black") when the row is a variant. */
  variant: string | null;
  sku: string;
  stockQuantity: number;
  lowStockThreshold: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const db = getDb();

  // Rolling windows: [now-30d, now) vs [now-60d, now-30d). Timestamps are
  // stored in UTC, and month buckets below are UTC months.
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * DAY_MS);
  const d60 = new Date(now.getTime() - 60 * DAY_MS);
  const chartStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

  const placed = placedOrderCondition();
  const revenue = revenueOrderCondition();
  const cur = gte(orders.createdAt, d30);
  const prev = and(gte(orders.createdAt, d60), lt(orders.createdAt, d30));

  // One scan of orders with FILTERed aggregates
  // instead of a query per number (each query is one HTTP round trip on the
  // Neon driver).
  const lowStockThreshold = sql<number>`COALESCE(${products.lowStockThreshold}, 5)`;

  const [
    [orderAgg],
    [customerAgg],
    [productAgg],
    recentOrdersData,
    statusCounts,
    monthlyData,
    mostSoldRows,
    lowSimple,
    lowVariants,
  ] = await Promise.all([
    db
      .select({
        revenueAll: sql<string>`COALESCE(SUM(${orders.total}) FILTER (WHERE ${revenue}), 0)`,
        revenueCur: sql<string>`COALESCE(SUM(${orders.total}) FILTER (WHERE ${revenue} AND ${cur}), 0)`,
        revenuePrev: sql<string>`COALESCE(SUM(${orders.total}) FILTER (WHERE ${revenue} AND ${prev}), 0)`,
        revenueOrdersCur: sql<number>`(COUNT(*) FILTER (WHERE ${revenue} AND ${cur}))::int`,
        revenueOrdersPrev: sql<number>`(COUNT(*) FILTER (WHERE ${revenue} AND ${prev}))::int`,
        placedAll: sql<number>`(COUNT(*) FILTER (WHERE ${placed}))::int`,
        placedCur: sql<number>`(COUNT(*) FILTER (WHERE ${placed} AND ${cur}))::int`,
        placedPrev: sql<number>`(COUNT(*) FILTER (WHERE ${placed} AND ${prev}))::int`,
        toFulfil: sql<number>`(COUNT(*) FILTER (WHERE ${revenue} AND ${inArray(orders.status, ['pending', 'processing'])}))::int`,
        // Unpaid checkouts, still open or already cancelled (expired after an
        // hour by lib/order-expiry.ts, or by the admin).
        abandonedCur: sql<number>`(COUNT(*) FILTER (WHERE ${eq(orders.paymentStatus, 'pending')} AND ${inArray(orders.status, ['pending_payment', 'cancelled'])} AND ${cur}))::int`,
      })
      .from(orders),
    db
      .select({
        total: sql<number>`COUNT(*)::int`,
        cur: sql<number>`(COUNT(*) FILTER (WHERE ${gte(users.createdAt, d30)}))::int`,
        prev: sql<number>`(COUNT(*) FILTER (WHERE ${and(gte(users.createdAt, d60), lt(users.createdAt, d30))}))::int`,
      })
      .from(users),
    db.select({ total: count() }).from(products),
    db
      .select({
        id: orders.id,
        orderId: orders.orderId,
        email: orders.email,
        shippingAddress: orders.shippingAddress,
        total: orders.total,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(placed)
      .orderBy(desc(orders.createdAt))
      .limit(5),
    db
      .select({ status: orders.status, count: count() })
      .from(orders)
      .where(placed)
      .groupBy(orders.status),
    db
      .select({
        month: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM')`,
        revenue: sql<string>`COALESCE(SUM(${orders.total}), 0)`,
        orders: count(),
      })
      .from(orders)
      .where(and(revenue, gte(orders.createdAt, chartStart)))
      .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM')`),
    // Unnest the items jsonb of revenue orders and aggregate in Postgres.
    db
      .select({
        name: sql<string>`item->>'name'`,
        totalQuantity: sql<number>`COALESCE(SUM((item->>'quantity')::int), 0)::int`,
        totalRevenue: sql<number>`COALESCE(SUM((item->>'quantity')::int * (item->>'price')::numeric), 0)::float`,
      })
      .from(
        sql`(SELECT jsonb_array_elements(${orders.items}) AS item FROM ${orders} WHERE ${revenue}) AS t`
      )
      .groupBy(sql`item->>'name'`)
      .orderBy(desc(sql`COALESCE(SUM((item->>'quantity')::int), 0)::int`))
      .limit(5),
    // Simple products track stock on the product row.
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        stockQuantity: products.stockQuantity,
        lowStockThreshold,
      })
      .from(products)
      .where(
        and(
          eq(products.status, 'published'),
          eq(products.manageStock, true),
          eq(products.productType, 'simple'),
          sql`COALESCE(${products.stockQuantity}, 0) <= ${lowStockThreshold}`
        )
      )
      .orderBy(sql`COALESCE(${products.stockQuantity}, 0)`),
    // Variable products track stock per variant; the parent's own
    // stock_quantity is not what the storefront sells from.
    db
      .select({
        id: products.id,
        name: products.name,
        attributes: productVariants.attributes,
        sku: productVariants.sku,
        stockQuantity: productVariants.stockQuantity,
        lowStockThreshold,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(
        and(
          eq(products.status, 'published'),
          eq(products.manageStock, true),
          eq(products.productType, 'variable'),
          sql`COALESCE(${productVariants.stockQuantity}, 0) <= ${lowStockThreshold}`
        )
      )
      .orderBy(sql`COALESCE(${productVariants.stockQuantity}, 0)`),
  ]);

  const revenueCur = num(orderAgg?.revenueCur);
  const revenuePrev = num(orderAgg?.revenuePrev);
  const revOrdersCur = num(orderAgg?.revenueOrdersCur);
  const revOrdersPrev = num(orderAgg?.revenueOrdersPrev);
  const aovCur = revOrdersCur > 0 ? revenueCur / revOrdersCur : 0;
  const aovPrev = revOrdersPrev > 0 ? revenuePrev / revOrdersPrev : 0;
  const placedCur = num(orderAgg?.placedCur);
  const placedPrev = num(orderAgg?.placedPrev);
  const custCur = num(customerAgg?.cur);
  const custPrev = num(customerAgg?.prev);

  const recentOrders: RecentOrder[] = recentOrdersData.map((o) => {
    const addr = o.shippingAddress as ShippingAddressDB | null;
    const name = addr ? `${addr.firstName || ''} ${addr.lastName || ''}`.trim() : '';
    return {
      id: o.id,
      orderId: o.orderId,
      email: o.email,
      customerName: name || o.email,
      total: num(o.total),
      status: o.status,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt,
    };
  });

  const mostSoldItems: MostSoldItem[] = mostSoldRows.map((m) => ({
    name: m.name || 'Unknown',
    totalQuantity: num(m.totalQuantity),
    totalRevenue: num(m.totalRevenue),
  }));

  const ordersByStatus: StatusCount[] = statusCounts
    .map((s) => ({ status: s.status, count: s.count }))
    .sort((a, b) => b.count - a.count);

  // Fill every month in the window, including months with no sales, so the
  // chart's x-axis is continuous.
  const byMonth = new Map(monthlyData.map((m) => [m.month, m]));
  const revenueByMonth: MonthlyRevenue[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(chartStart.getUTCFullYear(), chartStart.getUTCMonth() + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const row = byMonth.get(key);
    revenueByMonth.push({
      month: MONTH_NAMES[d.getUTCMonth()],
      key,
      revenue: num(row?.revenue),
      orders: row?.orders ?? 0,
    });
  }

  const allLow: LowStockItem[] = [
    ...lowSimple.map((p) => ({
      id: p.id,
      name: p.name,
      variant: null,
      sku: p.sku,
      stockQuantity: p.stockQuantity ?? 0,
      lowStockThreshold: num(p.lowStockThreshold),
    })),
    ...lowVariants.map((v) => ({
      id: v.id,
      name: v.name,
      variant:
        Object.entries(v.attributes || {})
          .map(([k, val]) => `${k}: ${val}`)
          .join(', ') || null,
      sku: v.sku,
      stockQuantity: v.stockQuantity ?? 0,
      lowStockThreshold: num(v.lowStockThreshold),
    })),
  ].sort((a, b) => a.stockQuantity - b.stockQuantity);

  return {
    totalRevenue: num(orderAgg?.revenueAll),
    totalOrders: num(orderAgg?.placedAll),
    totalCustomers: num(customerAgg?.total),
    totalProducts: productAgg?.total ?? 0,
    revenue30: revenueCur,
    orders30: placedCur,
    newCustomers30: custCur,
    averageOrderValue30: aovCur,
    revenueChange: pctChange(revenueCur, revenuePrev),
    ordersChange: pctChange(placedCur, placedPrev),
    customersChange: pctChange(custCur, custPrev),
    averageOrderValueChange: pctChange(aovCur, aovPrev),
    ordersToFulfil: num(orderAgg?.toFulfil),
    abandonedCheckouts30: num(orderAgg?.abandonedCur),
    recentOrders,
    mostSoldItems,
    ordersByStatus,
    revenueByMonth,
    lowStock: allLow.slice(0, 10),
    lowStockCount: allLow.length,
  };
}
