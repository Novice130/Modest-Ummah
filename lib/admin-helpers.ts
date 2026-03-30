import { getDb } from './db';
import { orders, products, users } from './schema';
import { sql, eq, desc, count, sum, and, gte } from 'drizzle-orm';
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

export async function getDashboardStats(): Promise<DashboardStats> {
  const db = getDb();

  // Current period (last 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // Total Revenue (paid orders)
  const [revenueRow] = await db
    .select({ total: sum(orders.total) })
    .from(orders)
    .where(eq(orders.paymentStatus, 'paid'));
  const totalRevenue = parseFloat(revenueRow?.total || '0');

  // Revenue last 30 days
  const [revenueCurrent] = await db
    .select({ total: sum(orders.total) })
    .from(orders)
    .where(
      and(
        eq(orders.paymentStatus, 'paid'),
        gte(orders.createdAt, thirtyDaysAgo)
      )
    );
  const [revenuePrev] = await db
    .select({ total: sum(orders.total) })
    .from(orders)
    .where(
      and(
        eq(orders.paymentStatus, 'paid'),
        gte(orders.createdAt, sixtyDaysAgo),
        sql`${orders.createdAt} < ${thirtyDaysAgo}`
      )
    );
  const revCurrent = parseFloat(revenueCurrent?.total || '0');
  const revPrev = parseFloat(revenuePrev?.total || '0');
  const revenueChange = revPrev > 0 ? ((revCurrent - revPrev) / revPrev) * 100 : 0;

  // Total Orders
  const [ordersRow] = await db.select({ count: count() }).from(orders);
  const totalOrders = ordersRow?.count || 0;

  // Orders last 30 days vs prev 30 days
  const [ordersCurrent] = await db
    .select({ count: count() })
    .from(orders)
    .where(gte(orders.createdAt, thirtyDaysAgo));
  const [ordersPrev] = await db
    .select({ count: count() })
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, sixtyDaysAgo),
        sql`${orders.createdAt} < ${thirtyDaysAgo}`
      )
    );
  const ordCurrent = ordersCurrent?.count || 0;
  const ordPrev = ordersPrev?.count || 0;
  const ordersChange = ordPrev > 0 ? ((ordCurrent - ordPrev) / ordPrev) * 100 : 0;

  // Total Customers
  const [customersRow] = await db.select({ count: count() }).from(users);
  const totalCustomers = customersRow?.count || 0;

  // Customers last 30 days
  const [custCurrent] = await db
    .select({ count: count() })
    .from(users)
    .where(gte(users.createdAt, thirtyDaysAgo));
  const [custPrev] = await db
    .select({ count: count() })
    .from(users)
    .where(
      and(
        gte(users.createdAt, sixtyDaysAgo),
        sql`${users.createdAt} < ${thirtyDaysAgo}`
      )
    );
  const cCurrent = custCurrent?.count || 0;
  const cPrev = custPrev?.count || 0;
  const customersChange = cPrev > 0 ? ((cCurrent - cPrev) / cPrev) * 100 : 0;

  // Total Products
  const [productsRow] = await db.select({ count: count() }).from(products);
  const totalProducts = productsRow?.count || 0;

  // Recent Orders (last 10)
  const recentOrdersData = await db
    .select()
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(10);

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

  // Most Sold Items — aggregate from order items JSON
  const allOrders = await db
    .select({ items: orders.items })
    .from(orders)
    .where(eq(orders.paymentStatus, 'paid'));

  const itemMap = new Map<string, { quantity: number; revenue: number }>();
  for (const order of allOrders) {
    const items = (order.items || []) as OrderItem[];
    for (const item of items) {
      const existing = itemMap.get(item.name) || { quantity: 0, revenue: 0 };
      existing.quantity += item.quantity;
      existing.revenue += item.price * item.quantity;
      itemMap.set(item.name, existing);
    }
  }

  const mostSoldItems: MostSoldItem[] = Array.from(itemMap.entries())
    .map(([name, data]) => ({
      name,
      totalQuantity: data.quantity,
      totalRevenue: data.revenue,
    }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity)
    .slice(0, 10);

  // Orders by Status
  const statusCounts = await db
    .select({
      status: orders.status,
      count: count(),
    })
    .from(orders)
    .groupBy(orders.status);

  const ordersByStatus: StatusCount[] = statusCounts.map((s) => ({
    status: s.status,
    count: s.count,
  }));

  // Revenue by Month (last 6 months)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const monthlyData = await db
    .select({
      month: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM')`,
      revenue: sum(orders.total),
      orders: count(),
    })
    .from(orders)
    .where(
      and(
        eq(orders.paymentStatus, 'paid'),
        gte(orders.createdAt, sixMonthsAgo)
      )
    )
    .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM')`);

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
      estimatedWeight.toString(),
      length.toString(),
      width.toString(),
      height.toString(),
      order.orderId,
    ]
      .map((field) => `${String(field).replace(/"/g, '""')}`)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
