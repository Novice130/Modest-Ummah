import type { Metadata } from 'next';
import Link from 'next/link';
import { Package, ChevronRight, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'My Orders',
  description: 'View your order history.',
};

// Mock orders data
const orders = [
  {
    id: 'ORD-2024-001',
    date: '2024-01-15',
    status: 'delivered',
    paymentStatus: 'paid',
    total: 189.97,
    items: [
      { name: 'Premium White Thobe', quantity: 1, price: 89.99, image: '/images/products/thobe-1.jpg' },
      { name: 'Embroidered Kufi Cap', quantity: 2, price: 19.99, image: '/images/products/kufi-1.jpg' },
      { name: 'Arabian Oud Attar', quantity: 1, price: 49.99, image: '/images/products/attar-1.jpg' },
    ],
  },
  {
    id: 'ORD-2024-002',
    date: '2024-01-20',
    status: 'shipped',
    paymentStatus: 'paid',
    total: 129.99,
    items: [
      { name: 'Elegant Black Abaya', quantity: 1, price: 129.99, image: '/images/products/abaya-1.jpg' },
    ],
  },
  {
    id: 'ORD-2024-003',
    date: '2024-01-25',
    status: 'processing',
    paymentStatus: 'paid',
    total: 84.97,
    items: [
      { name: 'Premium Hijab Set', quantity: 2, price: 24.99, image: '/images/products/hijab-1.jpg' },
      { name: 'Natural Miswak (5 Pack)', quantity: 1, price: 12.99, image: '/images/products/miswak-1.jpg' },
      { name: 'Sage Khimar Set', quantity: 1, price: 59.99, image: '/images/products/khimar-1.jpg' },
    ],
  },
];

const getStatusColor = (status: string) => {
  switch (status) {
    case 'delivered':
      return 'success';
    case 'shipped':
      return 'default';
    case 'processing':
      return 'gold';
    case 'pending':
      return 'secondary';
    case 'cancelled':
      return 'destructive';
    default:
      return 'outline';
  }
};

export default function OrdersPage() {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container-custom py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/account" className="hover:text-foreground">Account</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground">Orders</span>
        </nav>

        <h1 className="font-heading text-3xl mb-8">My Orders</h1>

        {orders.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="font-heading text-xl mb-2">No orders yet</h2>
              <p className="text-muted-foreground mb-4">
                When you place an order, it will appear here.
              </p>
              <Button asChild>
                <Link href="/shop">Start Shopping</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <Card key={order.id}>
                <CardContent className="p-6">
                  {/* Order Header */}
                  <div className="flex flex-col md:flex-row justify-between gap-4 mb-4 pb-4 border-b">
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Order ID: </span>
                        <span className="font-medium">{order.id}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Date: </span>
                        <span>{new Date(order.date).toLocaleDateString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total: </span>
                        <span className="font-medium">{formatPrice(order.total)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusColor(order.status) as any}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </Badge>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/account/orders/${order.id}`}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Link>
                      </Button>
                    </div>
                  </div>

                  {/* Order Items */}
                  <div className="space-y-3">
                    {order.items.map((item, index) => (
                      <div key={index} className="flex items-center gap-4">
                        <div className="w-16 h-20 bg-muted rounded-md shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Qty: {item.quantity} × {formatPrice(item.price)}
                          </p>
                        </div>
                        <p className="font-medium">
                          {formatPrice(item.price * item.quantity)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
