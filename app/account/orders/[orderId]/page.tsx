import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, ExternalLink, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchCustomerOrder } from '@/lib/actions/order.actions';
import {
  formatOrderStatus,
  formatPaymentStatus,
  orderStatusBadgeVariant,
  paymentStatusBadgeVariant,
  trackingUrl,
} from '@/lib/order-status';
import { formatPrice, getImageUrl } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Order Details',
  description: 'View the details of your order.',
  robots: { index: false, follow: false },
};

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  // Scoped to the signed-in user inside the query: someone else's order is a
  // 404, the same as one that does not exist.
  const order = await fetchCustomerOrder(orderId);
  if (!order) notFound();

  const discount = parseFloat(order.discount);
  const address = order.shippingAddress;
  const trackUrl = trackingUrl(order.trackingCarrier, order.trackingNumber);

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container-custom py-8">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/account" className="hover:text-foreground">Account</Link>
          <ChevronRight className="h-4 w-4" />
          <Link href="/account/orders" className="hover:text-foreground">Orders</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground">{order.orderId}</span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
          <div>
            <h1 className="font-heading text-3xl">Order {order.orderId}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Placed on {formatDate(order.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={orderStatusBadgeVariant(order.status)}>
              {formatOrderStatus(order.status)}
            </Badge>
            <Badge variant={paymentStatusBadgeVariant(order.paymentStatus)}>
              {formatPaymentStatus(order.paymentStatus)}
            </Badge>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.items.map((item, index) => {
                const image = getImageUrl(item.image);
                const options = [item.size, item.color].filter(Boolean).join(' / ');
                return (
                  <div key={`${item.productId}-${item.variantId ?? ''}-${index}`} className="flex items-center gap-4">
                    <div className="w-16 h-20 bg-muted rounded-md overflow-hidden shrink-0">
                      {image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      {options && <p className="text-sm text-muted-foreground">{options}</p>}
                      <p className="text-sm text-muted-foreground">
                        Qty: {item.quantity} x {formatPrice(item.price)}
                      </p>
                    </div>
                    <p className="font-medium">{formatPrice(item.price * item.quantity)}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatPrice(parseFloat(order.subtotal))}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Discount{order.couponCode ? ` (${order.couponCode})` : ''}
                    </span>
                    <span>-{formatPrice(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>{formatPrice(parseFloat(order.shipping))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatPrice(parseFloat(order.tax))}</span>
                </div>
                <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2">
                  <span>Total</span>
                  <span>{formatPrice(parseFloat(order.total))}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Tracking
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {order.trackingNumber ? (
                  <>
                    {order.trackingCarrier && (
                      <p className="text-muted-foreground">{order.trackingCarrier}</p>
                    )}
                    <p className="font-medium break-all">{order.trackingNumber}</p>
                    {trackUrl && (
                      <a
                        href={trackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline hover:no-underline"
                      >
                        Track package
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Tracking will appear here once your order ships.
                  </p>
                )}
                {order.shippedAt && (
                  <p className="text-muted-foreground">Shipped {formatDate(order.shippedAt)}</p>
                )}
                {order.deliveredAt && (
                  <p className="text-muted-foreground">Delivered {formatDate(order.deliveredAt)}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Shipping Address</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>{[address.firstName, address.lastName].filter(Boolean).join(' ')}</p>
                <p>{address.address1}</p>
                {address.address2 && <p>{address.address2}</p>}
                <p>
                  {address.city}, {address.state} {address.postalCode}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
