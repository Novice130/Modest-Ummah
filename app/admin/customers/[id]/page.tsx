'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Mail, Calendar } from 'lucide-react';
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

export default function CustomerDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
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

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!customer) return <div className="p-8 text-center text-destructive">Customer not found</div>;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Customers
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{customer.name || customer.email}</CardTitle>
          <CardDescription className="flex flex-col gap-1">
            <span className="flex items-center gap-2">
              <Mail className="h-4 w-4" /> {customer.email}
            </span>
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Joined {formatDate(customer.createdAt)}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          <div>
            <p className="text-sm text-muted-foreground">Total Orders</p>
            <p className="text-2xl font-bold">{customer.totalOrders}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Lifetime Spend (paid)</p>
            <p className="text-2xl font-bold">{formatPrice(customer.totalSpent)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Email Verified</p>
            <Badge variant={customer.verified ? 'success' : 'outline'}>
              {customer.verified ? 'Yes' : 'No'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order History</CardTitle>
        </CardHeader>
        <CardContent>
          {customer.orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No orders yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.orderId}</TableCell>
                      <TableCell className="text-sm">{formatDate(o.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant={orderStatusBadgeVariant(o.status)}>
                          {formatOrderStatus(o.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={o.paymentStatus === 'paid' ? 'success' : 'destructive'} className="text-[10px]">
                          {o.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{formatPrice(o.total)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/admin/orders/${o.id}`}>View</Link>
                        </Button>
                      </TableCell>
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
