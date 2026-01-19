import Link from 'next/link';
import { Search, Eye, Download, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatPrice } from '@/lib/utils';

// Mock orders
const orders = [
  {
    id: 'ORD-2024-001',
    customer: 'Fatima Hassan',
    email: 'fatima@example.com',
    date: '2024-01-15T10:30:00',
    total: 189.97,
    items: 3,
    status: 'delivered',
    paymentStatus: 'paid',
  },
  {
    id: 'ORD-2024-002',
    customer: 'Ahmed Khan',
    email: 'ahmed@example.com',
    date: '2024-01-16T14:45:00',
    total: 129.99,
    items: 1,
    status: 'shipped',
    paymentStatus: 'paid',
  },
  {
    id: 'ORD-2024-003',
    customer: 'Aisha Rahman',
    email: 'aisha@example.com',
    date: '2024-01-17T09:15:00',
    total: 249.99,
    items: 2,
    status: 'processing',
    paymentStatus: 'paid',
  },
  {
    id: 'ORD-2024-004',
    customer: 'Omar Farooq',
    email: 'omar@example.com',
    date: '2024-01-18T16:20:00',
    total: 59.99,
    items: 1,
    status: 'pending',
    paymentStatus: 'pending',
  },
  {
    id: 'ORD-2024-005',
    customer: 'Maryam Ali',
    email: 'maryam@example.com',
    date: '2024-01-18T18:00:00',
    total: 179.97,
    items: 4,
    status: 'processing',
    paymentStatus: 'paid',
  },
];

const getStatusBadge = (status: string) => {
  const variants: Record<string, string> = {
    delivered: 'success',
    shipped: 'default',
    processing: 'gold',
    pending: 'secondary',
    cancelled: 'destructive',
  };
  return variants[status] || 'outline';
};

const getPaymentBadge = (status: string) => {
  const variants: Record<string, string> = {
    paid: 'success',
    pending: 'gold',
    failed: 'destructive',
    refunded: 'secondary',
  };
  return variants[status] || 'outline';
};

export default function AdminOrdersPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-heading text-3xl">Orders</h1>
          <p className="text-muted-foreground">Manage and track customer orders</p>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{orders.length}</p>
            <p className="text-sm text-muted-foreground">Total Orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{orders.filter(o => o.status === 'pending').length}</p>
            <p className="text-sm text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{orders.filter(o => o.status === 'processing').length}</p>
            <p className="text-sm text-muted-foreground">Processing</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{formatPrice(orders.reduce((sum, o) => sum + o.total, 0))}</p>
            <p className="text-sm text-muted-foreground">Total Revenue</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by order ID or customer..." className="pl-10" />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all">
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Payment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Order ID</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Customer</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Date</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Items</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Total</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Payment</th>
                  <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-4 px-6">
                      <span className="font-medium">{order.id}</span>
                    </td>
                    <td className="py-4 px-6">
                      <div>
                        <p className="font-medium">{order.customer}</p>
                        <p className="text-sm text-muted-foreground">{order.email}</p>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm">
                      {new Date(order.date).toLocaleDateString()}
                      <br />
                      <span className="text-muted-foreground">
                        {new Date(order.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="py-4 px-6">{order.items}</td>
                    <td className="py-4 px-6 font-medium">{formatPrice(order.total)}</td>
                    <td className="py-4 px-6">
                      <Badge variant={getStatusBadge(order.status) as any}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </Badge>
                    </td>
                    <td className="py-4 px-6">
                      <Badge variant={getPaymentBadge(order.paymentStatus) as any}>
                        {order.paymentStatus.charAt(0).toUpperCase() + order.paymentStatus.slice(1)}
                      </Badge>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/admin/orders/${order.id}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing 1-{orders.length} of {orders.length} orders
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>Previous</Button>
          <Button variant="outline" size="sm" disabled>Next</Button>
        </div>
      </div>
    </div>
  );
}
