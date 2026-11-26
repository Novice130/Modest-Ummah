'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Mail, Calendar, Phone, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatPrice } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { fetchCustomerDetail, type CustomerDetail } from '@/lib/actions/customer.actions';
import { orderStatusBadgeVariant, formatOrderStatus } from '@/lib/order-status';

const PROVIDER_LABELS: Record<string, string> = {
  email: 'Email & password',
  google: 'Google',
  apple: 'Apple',
};

function paymentBadgeVariant(status: string) {
  if (status === 'paid') return 'success' as const;
  if (status === 'refunded' || status === 'partial') return 'secondary' as const;
  return 'destructive' as const;
}

export default function CustomerDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { toast } = useToast();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchCustomerDetail(id)
      .then(setCustomer)
      .catch((e) => {
        toast({
          title: 'Failed to load customer',
          description: e?.message || 'Something went wrong.',
          variant: 'destructive',
        });
      })
      .finally(() => setLoading(false));
  }, [id, toast]);

  // A real link, not router.back(): a detail page opened directly (new tab,
  // bookmark) has no history entry to go back to.
  const backLink = (
    <Button variant="ghost" asChild>
      <Link href="/admin/customers">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Customers
      </Link>
    </Button>
  );

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!customer) {
    return (
      <div className="space-y-6">
        {backLink}
        <div className="p-8 text-center text-destructive">Customer not found</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {backLink}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{customer.name || customer.email}</CardTitle>
            <CardDescription className="flex flex-col gap-1">
              <span className="flex items-center gap-2 break-all">
                <Mail className="h-4 w-4 shrink-0" />
                <a href={`mailto:${customer.email}`} className="hover:underline">
                  {customer.email}
                </a>
                <Badge variant={customer.verified ? 'success' : 'outline'} className="text-[10px]">
                  {customer.verified ? 'Verified' : 'Unverified'}
                </Badge>
              </span>
              {customer.phone && (
                <span className="flex items-center gap-2">
                  <Phone className="h-4 w-4" /> {customer.phone}
                </span>
              )}
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Joined {formatDate(customer.createdAt)}
              </span>
              <span className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Signs in with{' '}
                {PROVIDER_LABELS[customer.authProvider] || customer.authProvider}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Orders</p>
              <p className="text-2xl font-bold">{customer.totalOrders}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Lifetime Spend</p>
              <p className="text-2xl font-bold">{formatPrice(customer.totalSpent)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg. Order</p>
              <p className="text-2xl font-bold">{formatPrice(customer.averageOrderValue)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last Order</p>
              <p className="text-lg font-semibold">
                {customer.lastOrderAt ? formatDate(customer.lastOrderAt) : '—'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Addresses</CardTitle>
            <CardDescription>Shipping addresses used on paid orders.</CardDescription>
          </CardHeader>
          <CardContent>
            {customer.addresses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No addresses on file.</p>
            ) : (
              <ul className="space-y-4 text-sm">
                {customer.addresses.map((a, i) => (
                  <li key={i} className="leading-relaxed">
                    {i === 0 && (
                      <Badge variant="outline" className="text-[10px] mb-1">
                        Most recent
                      </Badge>
                    )}
                    <p className="font-medium">
                      {`${a.firstName || ''} ${a.lastName || ''}`.trim()}
                    </p>
                    <p>{a.address1}</p>
                    {a.address2 && <p>{a.address2}</p>}
                    <p>
                      {[a.city, a.state].filter(Boolean).join(', ')} {a.postalCode}
                    </p>
                    <p>{a.country}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order History</CardTitle>
          <CardDescription>
            Paid orders, newest first. Spend excludes cancelled and refunded
            orders.
            {customer.unpaidCheckouts > 0 &&
              ` ${customer.unpaidCheckouts} unpaid checkout attempt${customer.unpaidCheckouts === 1 ? '' : 's'} not shown.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {customer.orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No paid orders yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">
                        <Link href={`/admin/orders/${o.id}`} className="text-primary hover:underline">
                          {o.orderId}
                        </Link>
                        {o.guest && (
                          <Badge variant="outline" className="text-[10px] ml-2 font-sans">
                            Guest checkout
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{formatDate(o.createdAt)}</TableCell>
                      <TableCell className="text-sm">{o.itemCount}</TableCell>
                      <TableCell>
                        <Badge variant={orderStatusBadgeVariant(o.status)}>
                          {formatOrderStatus(o.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={paymentBadgeVariant(o.paymentStatus)} className="text-[10px]">
                          {o.paymentStatus === 'partial' ? 'Partially refunded' : formatOrderStatus(o.paymentStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatPrice(o.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
