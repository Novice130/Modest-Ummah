import { getDb } from './db';
import { orders, products, users } from './schema';
import { sql, eq, desc, count, sum, and, gte, lt } from 'drizzle-orm';
import type { OrderItem, ShippingAddressDB } from './schema';

// ─── Dashboard Stats ────────────────────────────────────

export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  totalProducts: number;
  revenueChange: number;
  ordersChange: number;
  customersChange: number;
  recentOrders: RecentOrder[];
  mostSoldItems: MostSoldItem[];
  ordersByStatus: StatusCount[];
  revenueByMonth: MonthlyRevenue[];
  lowStock: LowStockItem[];
}

export interface RecentOrder {
  id: string;
  orderId: string;
  email: string;
  customerName: string;
  total: number;
  status: string;
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
  month: string;
  revenue: number;
  orders: number;
}

export interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  stockQuantity: number;
  lowStockThreshold: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const db = getDb();

  // Current period (last 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // All independent queries fire in parallel instead of sequentially.
  const [
    revenueRow,
    revenueCurrent,
    revenuePrev,
    ordersRow,
    ordersCurrent,
    ordersPrev,
    customersRow,
    custCurrent,
    custPrev,
    productsRow,
    recentOrdersData,
    statusCounts,
    monthlyData,
    lowStockRows,
  ] = await Promise.all([
    db
      .select({ total: sum(orders.total) })
      .from(orders)
      .where(eq(orders.paymentStatus, 'paid')),
    db
      .select({ total: sum(orders.total) })
      .from(orders)
      .where(and(eq(orders.paymentStatus, 'paid'), gte(orders.createdAt, thirtyDaysAgo))),
    db
      .select({ total: sum(orders.total) })
      .from(orders)
      .where(
        and(
          eq(orders.paymentStatus, 'paid'),
          gte(orders.createdAt, sixtyDaysAgo),
          lt(orders.createdAt, thirtyDaysAgo)
        )
      ),
    db.select({ count: count() }).from(orders),
    db.select({ count: count() }).from(orders).where(gte(orders.createdAt, thirtyDaysAgo)),
    db
      .select({ count: count() })
      .from(orders)
      .where(and(gte(orders.createdAt, sixtyDaysAgo), lt(orders.createdAt, thirtyDaysAgo))),
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(users).where(gte(users.createdAt, thirtyDaysAgo)),
    db
      .select({ count: count() })
      .from(users)
      .where(and(gte(users.createdAt, sixtyDaysAgo), lt(users.createdAt, thirtyDaysAgo))),
    db.select({ count: count() }).from(products),
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(10),
    db
      .select({ status: orders.status, count: count() })
      .from(orders)
      .groupBy(orders.status),
    db
      .select({
        month: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM')`,
        revenue: sum(orders.total),
        orders: count(),
      })
      .from(orders)
      .where(
        and(eq(orders.paymentStatus, 'paid'), gte(orders.createdAt, new Date(now.getFullYear(), now.getMonth() - 5, 1)))
      )
      .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM')`),
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        stockQuantity: products.stockQuantity,
        lowStockThreshold: products.lowStockThreshold,
      })
      .from(products)
      .where(
        and(
          eq(products.status, 'published'),
          eq(products.manageStock, true)
        )
      ),
  ]);

  const totalRevenue = parseFloat(revenueRow[0]?.total || '0');
  const revCurrent = parseFloat(revenueCurrent[0]?.total || '0');
  const revPrev = parseFloat(revenuePrev[0]?.total || '0');
  const revenueChange = revPrev > 0 ? ((revCurrent - revPrev) / revPrev) * 100 : 0;

  const totalOrders = ordersRow[0]?.count || 0;
  const ordCurrent = ordersCurrent[0]?.count || 0;
  const ordPrev = ordersPrev[0]?.count || 0;
  const ordersChange = ordPrev > 0 ? ((ordCurrent - ordPrev) / ordPrev) * 100 : 0;

  const totalCustomers = customersRow[0]?.count || 0;
  const cCurrent = custCurrent[0]?.count || 0;
  const cPrev = custPrev[0]?.count || 0;
  const customersChange = cPrev > 0 ? ((cCurrent - cPrev) / cPrev) * 100 : 0;

  const totalProducts = productsRow[0]?.count || 0;

  const recentOrders: RecentOrder[] = recentOrdersData.map((o) => {
    const addr = o.shippingAddress as ShippingAddressDB;
    return {
      id: o.id,
      orderId: o.orderId,
      email: o.email,
      customerName: addr ? `${addr.firstName || ''} ${addr.lastName || ''}`.trim() : o.email,
      total: parseFloat(o.total as string),
      status: o.status,
      createdAt: o.createdAt,
    };
  });

  // Most-sold aggregation in SQL: unnest the items jsonb of paid orders.
  // The old implementation loaded every paid order into JS; this pushes the
  // aggregation into Postgres.
  const mostSoldRows = await db
    .select({
      name: sql<string>`item->>'name'`,
      totalQuantity: sql<number>`COALESCE(SUM((item->>'quantity')::int), 0)::int`,
      totalRevenue: sql<number>`COALESCE(SUM((item->>'quantity')::int * (item->>'price')::numeric), 0)::float`,
    })
    .from(
      sql`(SELECT jsonb_array_elements(${orders.items}) AS item FROM ${orders} WHERE ${orders.paymentStatus} = 'paid') AS t`
    )
    .groupBy(sql`item->>'name'`)
    .orderBy(desc(sql`COALESCE(SUM((item->>'quantity')::int), 0)::int`))
    .limit(10);

  const mostSoldItems: MostSoldItem[] = mostSoldRows.map((m) => ({
    name: m.name || 'Unknown',
    totalQuantity: Number(m.totalQuantity || 0),
    totalRevenue: Number(m.totalRevenue || 0),
  }));

  const ordersByStatus: StatusCount[] = statusCounts.map((s) => ({
    status: s.status,
    count: s.count,
  }));

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const revenueByMonth: MonthlyRevenue[] = monthlyData.map((m) => {
    const [, monthNum] = (m.month || '').split('-');
    const monthIdx = parseInt(monthNum, 10) - 1;
    return {
      month: monthNames[monthIdx] || m.month,
      revenue: parseFloat(m.revenue || '0'),
      orders: m.orders,
    };
  });

  const lowStock: LowStockItem[] = lowStockRows
    .filter((p) => (p.stockQuantity || 0) <= (p.lowStockThreshold ?? 5))
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      stockQuantity: p.stockQuantity || 0,
      lowStockThreshold: p.lowStockThreshold ?? 5,
    }))
    .slice(0, 10);

  return {
    totalRevenue,
    totalOrders,
    totalCustomers,
    totalProducts,
    revenueChange,
    ordersChange,
    customersChange,
    recentOrders,
    mostSoldItems,
    ordersByStatus,
    revenueByMonth,
    lowStock,
  };
}

// ─── Pirate Ship CSV Export ─────────────────────────────

/**
 * Generate Pirate Ship-compatible CSV from orders.
 * Matches the exact header format from the sample:
 * Name,Company,Email,Phone,Address Line 1,Address Line 2,City,State,Zip,Country,Weight (oz),Length (in),Width (in),Height (in),Order ID
 */
export function generatePirateShipCSV(
  orderData: Array<{
    orderId: string;
    email: string;
    shippingAddress: ShippingAddressDB;
    items: OrderItem[];
    total: number;
  }>
): string {
  // Exact Pirate Ship header format
  const headers = [
    'Name',
    'Company',
    'Email',
    'Phone',
    'Address Line 1',
    'Address Line 2',
    'City',
    'State',
    'Zip',
    'Country',
    'Weight (oz)',
    'Length (in)',
    'Width (in)',
    'Height (in)',
    'Order ID',
  ];

  const rows = orderData.map((order) => {
    const addr = order.shippingAddress || {} as ShippingAddressDB;
    const fullName = `${addr.firstName || ''} ${addr.lastName || ''}`.trim();

    // Calculate total weight from items (default 8 oz per item if no weight data)
    const estimatedWeight = order.items.reduce((sum, item) => {
      return sum + (item.quantity * 8); // Default 8 oz per item
    }, 0);

    // US standard small parcel dimensions (USPS-friendly defaults)
    const length = 12; // inches
    const width = 9;   // inches
    const height = 4;  // inches

    return [
      fullName,
      'Modest Ummah',
      order.email,
      addr.phone || '',
      addr.address1 || '',
      addr.address2 || '',
      addr.city || '',
      addr.state || '',
      addr.postalCode || '',
      addr.country || 'US',
      String(estimatedWeight || 16),
      String(length),
      String(width),
      String(height),
      order.orderId,
    ]
      // RFC 4180: quote any field containing a comma, quote, or newline,
      // and double embedded quotes.
      .map((field) => {
        const value = String(field);
        if (/[",\n\r]/.test(value)) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
