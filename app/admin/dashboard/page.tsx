'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Package,
  ShoppingCart,
  Users,
  DollarSign,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Loader2,
  TrendingUp,
  Star,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPrice, formatDate } from '@/lib/utils';
import { formatOrderStatus, orderStatusBadgeVariant } from '@/lib/order-status';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from 'recharts';

// Mirrors DashboardStats in lib/admin-helpers.ts after JSON serialisation
// (Dates arrive as ISO strings).
interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  totalProducts: number;
  revenue30: number;
  orders30: number;
  newCustomers30: number;
  averageOrderValue30: number;
  revenueChange: number | null;
  ordersChange: number | null;
  customersChange: number | null;
  averageOrderValueChange: number | null;
  ordersToFulfil: number;
  abandonedCheckouts30: number;
  recentOrders: {
    id: string;
    orderId: string;
    email: string;
    customerName: string;
    total: number;
    status: string;
    paymentStatus: string;
    createdAt: string;
  }[];
  mostSoldItems: {
    name: string;
    totalQuantity: number;
    totalRevenue: number;
  }[];
  ordersByStatus: {
    status: string;
    count: number;
  }[];
  revenueByMonth: {
    month: string;
    key: string;
    revenue: number;
    orders: number;
  }[];
  lowStock: {
    id: string;
    name: string;
    variant: string | null;
    sku: string;
    stockQuantity: number;
    lowStockThreshold: number;
  }[];
  lowStockCount: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  pending_payment: '#f59e0b',
  processing: '#3b82f6',
  shipped: '#8b5cf6',
  delivered: '#10b981',
  cancelled: '#ef4444',
};

const PIE_COLORS = ['#b5c1a0', '#d4a3a3', '#eedbb4', '#87a0d3', '#7b5e57', '#ef4444'];

const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

function RevenueTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload as DashboardStats['revenueByMonth'][number];
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-muted-foreground">Revenue: {formatPrice(point.revenue)}</p>
      <p className="text-muted-foreground">Paid orders: {point.orders}</p>
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold">{formatOrderStatus(String(payload[0].name))}</p>
      <p className="text-muted-foreground">{payload[0].value} orders</p>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Loaded once per visit. No polling or auto-refresh: the database is on a
  // plan that must be allowed to suspend when nobody is using the store.
  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/stats', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[60vh] flex items-center justify-center flex-col gap-4">
        <p className="text-destructive">{error}</p>
        <Button onClick={loadStats}>Retry</Button>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      title: 'Revenue',
      value: formatPrice(stats.revenue30),
      change: stats.revenueChange,
      detail: `${formatPrice(stats.totalRevenue)} all time`,
      icon: DollarSign,
    },
    {
      title: 'Orders',
      value: stats.orders30.toLocaleString(),
      change: stats.ordersChange,
      detail:
        `${stats.totalOrders.toLocaleString()} all time` +
        (stats.abandonedCheckouts30 > 0
          ? ` · ${stats.abandonedCheckouts30.toLocaleString()} abandoned checkout${stats.abandonedCheckouts30 === 1 ? '' : 's'}`
          : ''),
      icon: ShoppingCart,
    },
    {
      title: 'Average Order Value',
      value: formatPrice(stats.averageOrderValue30),
      change: stats.averageOrderValueChange,
      detail: 'Revenue ÷ paid orders',
      icon: Receipt,
    },
    {
      title: 'New Customers',
      value: stats.newCustomers30.toLocaleString(),
      change: stats.customersChange,
      detail: `${stats.totalCustomers.toLocaleString()} registered accounts`,
      icon: Users,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl">Dashboard</h1>
          <p className="text-muted-foreground">
            Last 30 days, compared with the 30 days before. Revenue counts paid
            orders only (excludes cancelled and refunded).
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/products/new">
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Link>
        </Button>
      </div>

      {/* Needs attention */}
      {(stats.ordersToFulfil > 0 || stats.lowStockCount > 0) && (
        <div className="flex flex-wrap gap-3">
          {stats.ordersToFulfil > 0 && (
            <Button variant="outline" asChild>
              <Link href="/admin/orders">
                <Package className="h-4 w-4 mr-2" />
                {stats.ordersToFulfil} paid order{stats.ordersToFulfil === 1 ? '' : 's'} to fulfil
              </Link>
            </Button>
          )}
          {stats.lowStockCount > 0 && (
            <Button variant="outline" asChild>
              <a href="#low-stock">
                <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />
                {stats.lowStockCount} low-stock item{stats.lowStockCount === 1 ? '' : 's'}
              </a>
            </Button>
          )}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                  {stat.change !== null ? (
                    <div
                      className={`flex items-center text-xs mt-1 ${
                        stat.change >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {stat.change >= 0 ? (
                        <ArrowUpRight className="h-3 w-3 mr-1" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 mr-1" />
                      )}
                      {Math.abs(stat.change).toFixed(1)}% vs previous 30 days
                    </div>
                  ) : (
                    <p className="text-xs mt-1 text-muted-foreground">
                      No data for previous 30 days
                    </p>
                  )}
                  <p className="text-xs mt-1 text-muted-foreground">{stat.detail}</p>
                </div>
                <div className="w-10 h-10 bg-sage-100 dark:bg-sage-900/30 rounded-lg flex items-center justify-center">
                  <stat.icon className="h-5 w-5 text-sage-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Revenue, Last 6 Months
            </CardTitle>
            <CardDescription>Paid orders by calendar month (UTC).</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.revenueByMonth.some((m) => m.revenue > 0) ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.revenueByMonth}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#b5c1a0" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#b5c1a0" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(val) => compactCurrency.format(val)}
                      width={56}
                    />
                    <Tooltip content={<RevenueTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#b5c1a0"
                      strokeWidth={2}
                      fill="url(#colorRevenue)"
                      name="Revenue"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No paid orders in the last 6 months
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Status Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Order Status</CardTitle>
            <CardDescription>All paid orders, by fulfilment status.</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.ordersByStatus.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.ordersByStatus}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={3}
                    >
                      {stats.ordersByStatus.map((entry, idx) => (
                        <Cell
                          key={entry.status}
                          fill={STATUS_COLORS[entry.status] || PIE_COLORS[idx % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend
                      formatter={(value: string) => (
                        <span className="text-xs">{formatOrderStatus(value)}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No order data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Low stock alerts */}
      {stats.lowStock.length > 0 && (
        <Card id="low-stock" className="border-amber-300 scroll-mt-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Low Stock Alerts
            </CardTitle>
            <CardDescription>
              Published products with stock tracking on, at or below their
              low-stock threshold
              {stats.lowStockCount > stats.lowStock.length
                ? ` (showing ${stats.lowStock.length} of ${stats.lowStockCount}, lowest first)`
                : ''}
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.lowStock.map((item) => (
                <div
                  key={`${item.id}:${item.sku}:${item.variant ?? ''}`}
                  className="flex items-center justify-between text-sm border-b last:border-0 py-2"
                >
                  <div>
                    <Link
                      href={`/admin/products/${item.id}`}
                      className="font-medium hover:underline"
                    >
                      {item.name}
                    </Link>
                    {item.variant && (
                      <span className="ml-2 text-muted-foreground text-xs">{item.variant}</span>
                    )}
                    <span className="ml-2 text-muted-foreground font-mono text-xs">
                      {item.sku || 'no sku'}
                    </span>
                  </div>
                  <span className="text-amber-600 font-medium whitespace-nowrap">
                    {item.stockQuantity === 0 ? 'Out of stock' : `${item.stockQuantity} left`} (threshold {item.lowStockThreshold})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bottom Row: Most Sold + Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Sold Items */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Top Sellers
            </CardTitle>
            <CardDescription>Units sold, all paid orders (all time).</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.mostSoldItems.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.mostSoldItems}
                    layout="vertical"
                    margin={{ left: 0, right: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
                            <p className="font-semibold">{data.name}</p>
                            <p className="text-muted-foreground">Qty Sold: {data.totalQuantity}</p>
                            <p className="text-muted-foreground">Revenue: {formatPrice(data.totalRevenue)}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="totalQuantity" fill="#b5c1a0" radius={[0, 4, 4, 0]} name="Qty Sold" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                No sales data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1.5">
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>Latest paid orders.</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/orders">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">
                      Order
                    </th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">
                      Date
                    </th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">
                      Customer
                    </th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">
                      Total
                    </th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentOrders.length > 0 ? (
                    stats.recentOrders.map((order) => (
                      <tr key={order.id} className="border-b last:border-0">
                        <td className="py-3 px-2 text-sm font-mono text-xs">
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="text-primary hover:underline"
                          >
                            {order.orderId}
                          </Link>
                        </td>
                        <td className="py-3 px-2 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(order.createdAt)}
                        </td>
                        <td className="py-3 px-2 text-sm truncate max-w-[120px]" title={order.email}>
                          {order.customerName || order.email}
                        </td>
                        <td className="py-3 px-2 text-sm">{formatPrice(order.total)}</td>
                        <td className="py-3 px-2">
                          <Badge
                            variant={orderStatusBadgeVariant(order.status)}
                            className="text-[10px]"
                          >
                            {formatOrderStatus(order.status)}
                          </Badge>
                          {order.paymentStatus !== 'paid' && (
                            <Badge variant="outline" className="text-[10px] ml-1">
                              {formatOrderStatus(order.paymentStatus)}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-muted-foreground">
                        No paid orders yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
