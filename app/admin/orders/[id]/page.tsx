'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  fetchAdminOrderAction,
  updateOrderStatusAction,
  fulfillOrderAction,
  addOrderNoteAction,
  refundOrderAction,
  cancelOrderAction,
  type AdminOrderDetail,
} from '@/lib/actions/order.actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Copy,
  Check,
  Printer,
  Truck,
  CheckCircle2,
  Mail,
  Phone,
  Undo2,
  XCircle,
  Loader2,
  PauseCircle,
  PlayCircle,
  ExternalLink,
  Package,
  AlertTriangle,
  User,
} from 'lucide-react';
import { formatPrice } from '@/lib/utils';
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
import {
  orderStatusBadgeVariant,
  formatOrderStatus,
  paymentStatusBadgeVariant,
  formatPaymentStatus,
  canTransition,
  isPaymentCaptured,
  trackingUrl,
  CARRIERS,
  type OrderStatusValue,
} from '@/lib/order-status';
import type { ShippingAddressDB } from '@/lib/schema';

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function addressLines(a: ShippingAddressDB | null | undefined): string[] {
  if (!a) return [];
  return [
    `${a.firstName || ''} ${a.lastName || ''}`.trim(),
    a.address1,
    a.address2,
    [a.city, [a.state, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    a.country,
  ].filter((l): l is string => Boolean(l && l.trim()));
}

function sameAddress(a: ShippingAddressDB | null, b: ShippingAddressDB | null) {
  return addressLines(a).join('|') === addressLines(b).join('|');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}

function humanService(service: string | null): string {
  if (!service) return '';
  if (service === 'standard') return 'Standard (free shipping)';
  return service.replace(/_/g, ' ').replace(/\busps\b/i, 'USPS').replace(/\b\w/g, (c) => c.toUpperCase());
}

type Confirm = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  run: () => Promise<void>;
};

export default function OrderDetailsPage() {
  const params = useParams();
  const id = params?.id as string;
  const { toast } = useToast();

  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingCarrier, setTrackingCarrier] = useState('USPS');
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [savingTracking, setSavingTracking] = useState(false);

  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const loadOrder = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchAdminOrderAction(id);
      setOrder(data);
      if (data) {
        setTrackingNumber(data.trackingNumber || '');
        setTrackingCarrier(data.trackingCarrier || 'USPS');
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadOrder();
  }, [id, loadOrder]);

  const fail = (title: string, e: any) =>
    toast({ title, description: e?.message || 'Something went wrong.', variant: 'destructive' });

  const handleCopyAddress = async () => {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(addressLines(order.shippingAddress).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Could not copy address', variant: 'destructive' });
    }
  };

  const changeStatus = async (status: OrderStatusValue) => {
    if (!order) return;
    setBusy(true);
    try {
      await updateOrderStatusAction(order.id, status);
      toast({ title: `Order marked as ${formatOrderStatus(status)}` });
      await loadOrder();
    } catch (e: any) {
      fail('Failed to update status', e);
    } finally {
      setBusy(false);
    }
  };

  const handleRefund = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await refundOrderAction(order.id);
      toast({ title: 'Refund issued', description: 'The order is marked as refunded.' });
      await loadOrder();
    } catch (e: any) {
      fail('Refund failed', e);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await cancelOrderAction(order.id);
      toast({ title: 'Order cancelled' });
      await loadOrder();
    } catch (e: any) {
      fail('Failed to cancel', e);
    } finally {
      setBusy(false);
    }
  };

  const handleFulfill = async (markShipped: boolean) => {
    if (!order) return;
    setSavingTracking(true);
    try {
      const result = await fulfillOrderAction(order.id, {
        trackingNumber,
        trackingCarrier: trackingNumber ? trackingCarrier : '',
        markShipped,
        notifyCustomer,
      });
      toast({
        title: markShipped ? 'Order marked as shipped' : 'Tracking saved',
        description: result.emailSent
          ? `Shipping email sent to ${order.email}.`
          : result.emailError
          ? `Shipping email failed: ${result.emailError}`
          : undefined,
        variant: result.emailError ? 'destructive' : undefined,
      });
      await loadOrder();
    } catch (e: any) {
      fail(markShipped ? 'Failed to mark shipped' : 'Failed to save tracking', e);
    } finally {
      setSavingTracking(false);
    }
  };

  const handleAddNote = async () => {
    if (!order || !newNote.trim()) return;
    setSavingNote(true);
    try {
      const note = await addOrderNoteAction(order.id, newNote);
      setOrder({ ...order, timeline: [note, ...order.timeline] });
      setNewNote('');
    } catch (e: any) {
      fail('Failed to add note', e);
    } finally {
      setSavingNote(false);
    }
  };

  const openPackingSlip = () => {
    if (!order) return;
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) {
      toast({ title: 'Allow pop-ups to print the packing slip', variant: 'destructive' });
      return;
    }
    const rows = order.items
      .map((i) => {
        const variant = [i.color, i.size].filter(Boolean).join(' / ');
        return `<tr><td>${escapeHtml(i.name)}${variant ? `<div class="muted">${escapeHtml(variant)}</div>` : ''}</td><td>${escapeHtml(i.sku || '')}</td><td class="r">${escapeHtml(i.quantity)}</td></tr>`;
      })
      .join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Packing slip ${escapeHtml(order.orderId)}</title>
<style>body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#222;margin:40px;font-size:14px}h1{font-size:22px;margin:0}
.muted{color:#666;font-size:12px}.grid{display:flex;justify-content:space-between;margin:24px 0}table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{text-align:left;border-bottom:1px solid #ddd;padding:8px 4px;vertical-align:top}.r{text-align:right}@media print{body{margin:0}}</style></head>
<body><h1>Modest Ummah</h1><div class="muted">Packing slip</div>
<div class="grid"><div><strong>Ship to</strong><br>${addressLines(order.shippingAddress).map(escapeHtml).join('<br>')}</div>
<div class="r"><strong>Order ${escapeHtml(order.orderId)}</strong><br>${escapeHtml(formatDateTime(order.createdAt))}<br>${escapeHtml(order.itemCount)} item(s)</div></div>
<table><thead><tr><th>Item</th><th>SKU</th><th class="r">Qty</th></tr></thead><tbody>${rows}</tbody></table>
<p class="muted" style="margin-top:32px">Thank you for shopping with Modest Ummah. Questions: support@modestummah.com</p>
<script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-destructive">Failed to load order: {loadError}</p>
        <Button variant="outline" onClick={() => { setLoading(true); loadOrder(); }}>
          Retry
        </Button>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-destructive">Order not found</p>
        <Button variant="outline" asChild>
          <Link href="/admin/orders">Back to orders</Link>
        </Button>
      </div>
    );
  }

  const address = order.shippingAddress || ({} as ShippingAddressDB);
  const paid = isPaymentCaptured(order.paymentStatus);
  const isShipped = order.status === 'shipped' || order.status === 'delivered';
  const canShip = canTransition(order, 'shipped');
  const canEditTracking = paid && order.status !== 'cancelled' && (isShipped || canShip);
  const canRefund = paid && Boolean(order.paymentIntentId);
  const computedTotal =
    Math.round((order.subtotal - order.discount + order.shipping + order.tax) * 100) / 100;
  const totalsMismatch = Math.abs(computedTotal - order.total) > 0.009;
  const trackUrl = trackingUrl(order.trackingCarrier, order.trackingNumber);
  const carrierOptions = Array.from(
    new Set<string>([...CARRIERS, ...(order.trackingCarrier ? [order.trackingCarrier] : [])])
  );
  const trackingDirty =
    trackingNumber.replace(/[\s-]/g, '').toUpperCase() !== (order.trackingNumber || '') ||
    (trackingNumber ? trackingCarrier : '') !== (order.trackingCarrier || '');
  const newTrackingWillEmail =
    Boolean(trackingNumber.trim()) &&
    trackingNumber.replace(/[\s-]/g, '').toUpperCase() !== (order.trackingNumber || '');

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <Button variant="ghost" asChild className="self-start">
          <Link href="/admin/orders">
            <ArrowLeft className="mr-2 h-4 w-4" /> Orders
          </Link>
        </Button>
        <div className="flex gap-2 flex-wrap">
          {canTransition(order, 'processing') && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => changeStatus('processing')}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              {order.status === 'pending' ? 'Release hold' : 'Mark processing'}
            </Button>
          )}
          {canTransition(order, 'pending') && (
            <Button variant="outline" disabled={busy} onClick={() => changeStatus('pending')}>
              <PauseCircle className="mr-2 h-4 w-4" /> Put on hold
            </Button>
          )}
          {canTransition(order, 'delivered') && (
            <Button
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: `Mark order ${order.orderId} as delivered?`,
                  description: 'Delivered is final: the order can no longer change status.',
                  confirmLabel: 'Mark delivered',
                  run: () => changeStatus('delivered'),
                })
              }
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Mark delivered
            </Button>
          )}
          {canRefund && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: `Refund order ${order.orderId}?`,
                  description: isShipped
                    ? `Stripe refunds everything not yet refunded of the ${formatPrice(order.total)} charge. This order has already shipped: stock is still returned to inventory by the Stripe webhook, so adjust stock if the items are not coming back. This cannot be undone.`
                    : `Stripe refunds everything not yet refunded of the ${formatPrice(order.total)} charge, the order is cancelled and its items are restocked. This cannot be undone.`,
                  confirmLabel: 'Issue refund',
                  destructive: true,
                  run: handleRefund,
                })
              }
            >
              <Undo2 className="mr-2 h-4 w-4" /> Refund
            </Button>
          )}
          {canTransition(order, 'cancelled') && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: `Cancel order ${order.orderId}?`,
                  description:
                    'This order has not been paid, so nothing is charged or refunded and no stock is returned. Cancelled orders cannot be reopened.',
                  confirmLabel: 'Cancel order',
                  destructive: true,
                  run: handleCancel,
                })
              }
            >
              <XCircle className="mr-2 h-4 w-4" /> Cancel order
            </Button>
          )}
          <Button variant="outline" onClick={openPackingSlip}>
            <Printer className="mr-2 h-4 w-4" /> Packing slip
          </Button>
        </div>
      </div>

      {/* Title */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-3xl">Order {order.orderId}</h1>
        <Badge variant={paymentStatusBadgeVariant(order.paymentStatus)}>
          {formatPaymentStatus(order.paymentStatus)}
        </Badge>
        <Badge variant={orderStatusBadgeVariant(order.status)}>
          {formatOrderStatus(order.status)}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Placed {formatDateTime(order.createdAt)}
          {order.wooId != null && ` · Pirate Ship #${order.wooId}`}
        </span>
      </div>

      {order.status === 'pending_payment' && (
        <div className="flex gap-3 rounded-md border p-3 text-sm bg-muted/40">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            The customer reached checkout but payment has not completed. Stripe
            moves this order to Processing if it does. Do not ship it.
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle>Items ({order.itemCount})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        This order has no line items.
                      </TableCell>
                    </TableRow>
                  ) : (
                    order.items.map((item, i) => (
                      <TableRow key={`${item.productId}-${item.variantId || ''}-${i}`}>
                        <TableCell>
                          <Link
                            href={`/admin/products/${item.productId}`}
                            className="font-medium hover:underline"
                          >
                            {item.name}
                          </Link>
                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
                            {item.sku && <span>SKU {item.sku}</span>}
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
                            {item.weightOz ? <span>{item.weightOz} oz each</span> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{formatPrice(item.price)}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatPrice(item.price * item.quantity)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Fulfillment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" /> Fulfillment
              </CardTitle>
              <CardDescription>
                {order.status === 'cancelled'
                  ? 'This order is cancelled. Nothing to ship.'
                  : !paid
                  ? 'Fulfillment unlocks once the order is paid.'
                  : isShipped
                  ? `Shipped ${formatDateTime(order.shippedAt)}${
                      order.deliveredAt ? ` · Delivered ${formatDateTime(order.deliveredAt)}` : ''
                    }`
                  : 'Buy the label in Pirate Ship (it writes tracking back automatically), or enter it here.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-muted-foreground">Customer chose</div>
                  <div>{humanService(order.shippingService) || 'Not recorded'}</div>
                </div>
                {order.parcel && (
                  <div>
                    <div className="text-muted-foreground flex items-center gap-1">
                      <Package className="h-3.5 w-3.5" /> Package (estimate)
                    </div>
                    <div>
                      {order.parcel.weightOz} oz ({(order.parcel.weightOz / 16).toFixed(2)} lb) ·{' '}
                      {order.parcel.length} × {order.parcel.width} × {order.parcel.height} in
                    </div>
                  </div>
                )}
              </div>

              {(order.trackingNumber || order.labelUrl) && (
                <div className="rounded-md border p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {order.trackingNumber && (
                    <span>
                      <span className="text-muted-foreground">Tracking: </span>
                      <span className="font-mono">
                        {order.trackingCarrier} {order.trackingNumber}
                      </span>
                    </span>
                  )}
                  {trackUrl && (
                    <a
                      href={trackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Track <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {order.labelUrl && (
                    <a
                      href={order.labelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Shipping label <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {order.externalSource === 'pirateship' && (
                    <span className="text-xs text-muted-foreground">from Pirate Ship</span>
                  )}
                </div>
              )}

              {canEditTracking && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Carrier</Label>
                      <Select value={trackingCarrier} onValueChange={setTrackingCarrier}>
                        <SelectTrigger aria-label="Carrier">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {carrierOptions.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="tracking-number">Tracking number</Label>
                      <Input
                        id="tracking-number"
                        placeholder="9400 1000 0000 0000 0000 00"
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="notify-customer"
                      checked={notifyCustomer}
                      onCheckedChange={(v) => setNotifyCustomer(v === true)}
                      disabled={!trackingNumber.trim()}
                    />
                    <Label htmlFor="notify-customer" className="font-normal">
                      Email the tracking details to {order.email}
                      {!trackingNumber.trim() && ' (needs a tracking number)'}
                      {isShipped && trackingNumber.trim() && !newTrackingWillEmail && ' (only when the number changes)'}
                    </Label>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {isShipped ? (
                      <Button
                        variant="outline"
                        disabled={savingTracking || !trackingDirty}
                        onClick={() => handleFulfill(false)}
                      >
                        {savingTracking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save tracking
                      </Button>
                    ) : (
                      <>
                        {trackingDirty && trackingNumber.trim() && (
                          <Button
                            variant="outline"
                            disabled={savingTracking}
                            onClick={() => handleFulfill(false)}
                          >
                            Save tracking only
                          </Button>
                        )}
                        <Button
                          disabled={savingTracking || !canShip}
                          onClick={() =>
                            trackingNumber.trim()
                              ? handleFulfill(true)
                              : setConfirm({
                                  title: 'Ship without tracking?',
                                  description:
                                    'The order is marked shipped with no tracking number, and the customer is not emailed. You can add tracking later.',
                                  confirmLabel: 'Mark shipped',
                                  run: () => handleFulfill(true),
                                })
                          }
                        >
                          {savingTracking ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Truck className="mr-2 h-4 w-4" />
                          )}
                          Mark as shipped
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>
                Internal notes and order history. Customers never see these.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add an internal note…"
                  rows={2}
                  maxLength={5000}
                  aria-label="New internal note"
                />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    disabled={savingNote || !newNote.trim()}
                    onClick={handleAddNote}
                  >
                    {savingNote && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add note
                  </Button>
                </div>
              </div>
              <Separator />
              <ol className="space-y-4 text-sm">
                {order.timeline.map((entry) => (
                  <li key={entry.id} className="border-l-2 pl-3">
                    <div className="whitespace-pre-wrap">{entry.note}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {entry.author} · {formatDateTime(entry.createdAt)}
                      {entry.customerNote && ' · customer notified'}
                    </div>
                  </li>
                ))}
                {order.notes && (
                  <li className="border-l-2 pl-3">
                    <div className="whitespace-pre-wrap">{order.notes}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Order note (payment system)
                    </div>
                  </li>
                )}
                <li className="border-l-2 pl-3">
                  <div>Order placed</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatDateTime(order.createdAt)}
                  </div>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          {/* Payment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                Payment
                <Badge variant={paymentStatusBadgeVariant(order.paymentStatus)}>
                  {formatPaymentStatus(order.paymentStatus)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Subtotal ({order.itemCount} item{order.itemCount === 1 ? '' : 's'})
                </span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Discount{order.couponCode ? ` (${order.couponCode})` : ''}
                  </span>
                  <span>−{formatPrice(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>{order.shipping === 0 ? 'Free' : formatPrice(order.shipping)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatPrice(order.tax)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span>{formatPrice(order.total)}</span>
              </div>
              {totalsMismatch && (
                <p className="text-xs text-destructive">
                  Line totals add up to {formatPrice(computedTotal)}, not the stored{' '}
                  {formatPrice(order.total)}. The stored total is what Stripe charged.
                </p>
              )}
              {order.paymentIntentId && (
                <a
                  href={`https://dashboard.stripe.com/payments/${encodeURIComponent(order.paymentIntentId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline pt-1"
                >
                  View in Stripe <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardContent>
          </Card>

          {/* Customer */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                {order.userId ? (
                  <Link href={`/admin/customers/${order.userId}`} className="hover:underline">
                    {order.customerName || 'View customer'}
                  </Link>
                ) : (
                  <span>
                    {order.customerName || 'Guest'}{' '}
                    <span className="text-muted-foreground">(guest checkout)</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${order.email}`} className="hover:underline break-all">
                  {order.email}
                </a>
              </div>
              {address.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${address.phone}`} className="hover:underline">
                    {address.phone}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipping address */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
              <CardTitle>Shipping address</CardTitle>
              <Button
                size="icon"
                variant="outline"
                onClick={handleCopyAddress}
                aria-label="Copy shipping address"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </CardHeader>
            <CardContent className="text-sm space-y-0.5">
              {addressLines(order.shippingAddress).length === 0 ? (
                <span className="text-muted-foreground">No address on file</span>
              ) : (
                addressLines(order.shippingAddress).map((line, i) => (
                  <div key={i} className={i === 0 ? 'font-medium' : undefined}>
                    {line}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Billing address, only when it differs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Billing address</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-0.5">
              {!order.billingAddress || sameAddress(order.billingAddress, order.shippingAddress) ? (
                <span className="text-muted-foreground">Same as shipping address</span>
              ) : (
                addressLines(order.billingAddress).map((line, i) => <div key={i}>{line}</div>)
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Go back</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirm?.destructive ? 'bg-destructive text-white hover:bg-destructive/90' : undefined
              }
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (!confirm) return;
                await confirm.run();
                setConfirm(null);
              }}
            >
              {busy ? 'Working…' : confirm?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
