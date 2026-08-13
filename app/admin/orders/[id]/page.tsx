'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  fetchOrderById,
  updateOrderAction,
  refundOrderAction,
  cancelOrderAction,
} from '@/lib/actions/order.actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  Copy,
  Check,
  Printer,
  Truck,
  CheckCircle2,
  MapPin,
  Mail,
  Phone,
  Calendar,
  DollarSign,
  Undo2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { formatPrice, formatDate } from '@/lib/utils';
import type { Order } from '@/types';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { orderStatusBadgeVariant, formatOrderStatus } from '@/lib/order-status';

export default function OrderDetailsPage() {
  return <OrderDetailsContent />;
}

function OrderDetailsContent() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { toast } = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingCarrier, setTrackingCarrier] = useState('');
  const [savingTracking, setSavingTracking] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (id) loadOrder();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadOrder() {
    try {
      const data = await fetchOrderById(id);
      setOrder(data);
      if (data) {
        setNotes(data.notes || '');
        setTrackingNumber(data.trackingNumber || '');
        setTrackingCarrier(data.trackingCarrier || '');
      }
    } catch (e: any) {
      toast({
        title: 'Failed to load order',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const handleCopyAddress = () => {
    if (!order) return;
    const addr = order.shippingAddress as any;
    const text = [
      addr.firstName + ' ' + addr.lastName,
      addr.address1,
      addr.address2,
      `${addr.city}, ${addr.state} ${addr.postalCode}`,
      addr.country,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!order) return;
    setBusy(true);
    try {
      const updated = await updateOrderAction(order.id, { status: newStatus as any });
      setOrder(updated);
      toast({ title: `Order marked as ${formatOrderStatus(newStatus)}` });
    } catch (e: any) {
      toast({
        title: 'Failed to update status',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRefund = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await refundOrderAction(order.id);
      toast({ title: 'Refund issued', description: 'Order marked as refunded.' });
      setConfirmRefund(false);
      loadOrder();
    } catch (e: any) {
      toast({
        title: 'Refund failed',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    setBusy(true);
    try {
      const updated = await cancelOrderAction(order.id);
      setOrder(updated);
      toast({ title: 'Order cancelled' });
      setConfirmCancel(false);
    } catch (e: any) {
      toast({
        title: 'Failed to cancel',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!order) return;
    setSavingNotes(true);
    try {
      const updated = await updateOrderAction(order.id, { notes });
      setOrder(updated);
      toast({ title: 'Notes saved' });
    } catch (e: any) {
      toast({
        title: 'Failed to save notes',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setSavingNotes(false);
    }
  };

  const handleSaveTracking = async () => {
    if (!order) return;
    setSavingTracking(true);
    try {
      const updated = await updateOrderAction(order.id, {
        trackingNumber,
        trackingCarrier,
      } as any);
      setOrder(updated);
      toast({ title: 'Tracking saved' });
    } catch (e: any) {
      toast({
        title: 'Failed to save tracking',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setSavingTracking(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!order) return <div className="p-8 text-center text-destructive">Order not found</div>;

  const address = (order.shippingAddress as any) || {};
  const canShip = order.status !== 'shipped' && order.status !== 'delivered' && order.status !== 'cancelled';
  const canRefund = order.paymentStatus === 'paid' && order.paymentIntentId;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Orders
        </Button>
        <div className="flex gap-2 flex-wrap">
          {canShip && (
            <Button disabled={busy} onClick={() => handleStatusUpdate('shipped')}>
              <Truck className="mr-2 h-4 w-4" /> Mark Shipped
            </Button>
          )}
          {order.status === 'shipped' && (
            <Button disabled={busy} onClick={() => handleStatusUpdate('delivered')}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Delivered
            </Button>
          )}
          {canRefund && (
            <Button variant="outline" disabled={busy} onClick={() => setConfirmRefund(true)}>
              <Undo2 className="mr-2 h-4 w-4" /> Refund
            </Button>
          )}
          {canShip && (
            <Button variant="outline" disabled={busy} onClick={() => setConfirmCancel(true)}>
              <XCircle className="mr-2 h-4 w-4" /> Cancel
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {/* Header Info */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex justify-between items-center">
              <span>Order #{order.orderId}</span>
              <Badge variant={orderStatusBadgeVariant(order.status)}>
                {formatOrderStatus(order.status)}
              </Badge>
            </CardTitle>
            <CardDescription>Placed on {formatDate(order.created)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" /> {order.email}
            </div>
            {address.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" /> {address.phone}
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <DollarSign className="h-4 w-4" /> Total: {formatPrice(order.total)}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" /> Payment: {order.paymentStatus?.toUpperCase()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4 flex flex-row items-start justify-between">
            <div>
              <CardTitle className="mb-2">Shipping Address</CardTitle>
              <CardDescription>Destination for this order</CardDescription>
            </div>
            <Button
              size="icon"
              variant="outline"
              onClick={handleCopyAddress}
              aria-label="Copy shipping address"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="font-semibold mb-1">
              {address.firstName} {address.lastName}
            </div>
            <div>{address.address1}</div>
            {address.address2 && <div>{address.address2}</div>}
            <div>
              {address.city}, {address.state} {address.postalCode}
            </div>
            <div>{address.country}</div>
          </CardContent>
        </Card>
      </div>

      {/* Order Items */}
      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(order.items as unknown as any[]).map((item, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="font-medium text-base mb-1">{item.name}</div>
                    <div className="text-xs text-muted-foreground flex gap-2">
                      <span>SKU: {item.sku || 'N/A'}</span>
                      {item.color && (
                        <Badge variant="outline" className="text-[10px]">
                          {item.color}
                        </Badge>
                      )}
                      {item.size && (
                        <Badge variant="outline" className="text-[10px]">
                          {item.size}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatPrice(item.price)}</TableCell>
                  <TableCell>x{item.quantity}</TableCell>
                  <TableCell className="font-semibold">
                    {formatPrice(item.price * item.quantity)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" /> Tracking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="tracking-carrier">Carrier</Label>
              <Input
                id="tracking-carrier"
                placeholder="USPS, UPS, FedEx…"
                value={trackingCarrier}
                onChange={(e) => setTrackingCarrier(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tracking-number">Tracking Number</Label>
              <Input
                id="tracking-number"
                placeholder="1Z…"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                disabled={savingTracking}
                onClick={handleSaveTracking}
              >
                {savingTracking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Tracking
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes about this order…"
            rows={3}
            aria-label="Order notes"
          />
          <div className="flex justify-end">
            <Button variant="outline" disabled={savingNotes} onClick={handleSaveNotes}>
              {savingNotes && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Notes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Financial Summary */}
      <div className="flex justify-end">
        <Card className="w-full md:w-1/3">
          <CardContent className="p-6 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Shipping</span>
              <span>{formatPrice(order.shipping)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatPrice(order.tax)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>{formatPrice(order.total)}</span>
            </div>
            <div className="pt-2">
              <Badge
                variant={order.paymentStatus === 'paid' ? 'success' : 'destructive'}
                className="w-full justify-center"
              >
                Payment: {order.paymentStatus?.toUpperCase()}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmRefund} onOpenChange={setConfirmRefund}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refund order {order.orderId}?</AlertDialogTitle>
            <AlertDialogDescription>
              A full refund of {formatPrice(order.total)} will be issued through
              Stripe and inventory will be restocked. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={handleRefund}
            >
              {busy ? 'Refunding…' : 'Issue refund'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel order {order.orderId}?</AlertDialogTitle>
            <AlertDialogDescription>
              The customer will not be charged. Paid orders must be refunded
              instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={handleCancel}
            >
              {busy ? 'Cancelling…' : 'Cancel order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
