import type { Metadata } from 'next';
import Link from 'next/link';
import { Package, ChevronRight, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/utils';
import { fetchUserOrders } from '@/lib/actions/order.actions';

export const metadata: Metadata = {
  title: 'My Orders',
  description: 'View your order history.',
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'delivered':
      return 'success';
    case 'shipped':
      return 'default';
    case 'processing':
      return 'gold';
    case 'pending':
    case 'pending_payment':
      return 'secondary';
    case 'cancelled':
      return 'destructive';
    default:
      return 'outline';
  }
};

const formatStatus = (status: string) => {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

export default async function OrdersPage() {
  const orders = await fetchUserOrders();

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
            {orders.map((order) => {
              const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items || [];

              return (
                <Card key={order.id}>
                  <CardContent className="p-6">
                    {/* Order Header */}
                    <div className="flex flex-col md:flex-row justify-between gap-4 mb-4 pb-4 border-b">
                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Order ID: </span>
                          <span className="font-medium">{order.orderId}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Date: </span>
                          <span>{new Date(order.created).toLocaleDateString()}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total: </span>
                          <span className="font-medium">{formatPrice(order.total)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={getStatusColor(order.status) as any}>
                          {formatStatus(order.status)}
                        </Badge>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/account/orders/${order.orderId}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </Link>
                        </Button>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="space-y-3">
                      {items.map((item: any, index: number) => (
                        <div key={index} className="flex items-center gap-4">
                          <div className="w-16 h-20 bg-muted rounded-md shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{item.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Qty: {item.quantity} x {formatPrice(item.price)}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
