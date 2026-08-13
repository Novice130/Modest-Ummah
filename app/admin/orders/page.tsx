'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, Loader2, Download, XCircle } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { fetchAllOrdersAdmin, cancelOrderAction } from '@/lib/actions/order.actions';
import { orderStatusBadgeVariant, formatOrderStatus } from '@/lib/order-status';

const STATUS_TABS = ['all', 'pending', 'pending_payment', 'processing', 'shipped', 'delivered', 'cancelled'] as const;

const PAGE_SIZE = 50;

export default function AdminOrdersPage() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [totalItems, setTotalItems] = useState(0);
  const [pendingCancel, setPendingCancel] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search to avoid a fetch per keystroke.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  useEffect(() => {
    loadOrders();
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadOrders() {
    setLoading(true);
    try {
      const result = await fetchAllOrdersAdmin({
        page: 1,
        limit: PAGE_SIZE,
        filter: debouncedSearch
          ? `email~"${debouncedSearch}" || orderId~"${debouncedSearch}"`
          : '',
      });
      setOrders(result.items);
      setTotalItems(result.totalItems);
    } catch (e: any) {
      toast({
        title: 'Failed to load orders',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // Filter by status tab (client-side over the fetched page).
  const filteredOrders =
    activeTab === 'all'
      ? orders
      : orders.filter((o) => o.status === activeTab);

  // ─── Pirate Ship CSV Export (server route) ─────────────

  const handleExportPirateShip = async (exportType: 'selected' | 'all') => {
    const ordersToExport =
      exportType === 'selected'
        ? filteredOrders.filter((o) => selectedIds.has(o.id))
        : filteredOrders;

    if (ordersToExport.length === 0) {
      toast({
        title: 'Nothing to export',
        description: 'No orders match the current selection.',
      });
      return;
    }

    try {
      const res = await fetch('/api/admin/orders/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: exportType === 'selected' ? ordersToExport.map((o) => o.id) : undefined,
          statusFilter:
            exportType === 'all' && activeTab !== 'all' ? activeTab : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pirate_ship_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: `Exported ${ordersToExport.length} orders` });
    } catch (e: any) {
      toast({
        title: 'Export failed',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    }
  };

  // ─── Selection Handlers ────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === filteredOrders.length && filteredOrders.length > 0
        ? new Set()
        : new Set(filteredOrders.map((o) => o.id))
    );
  };

  const handleCancelOrder = async () => {
    if (!pendingCancel) return;
    setCancelling(true);
    try {
      await cancelOrderAction(pendingCancel.id);
      toast({ title: 'Order cancelled' });
      setPendingCancel(null);
      loadOrders();
    } catch (e: any) {
      toast({
        title: 'Failed to cancel order',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl mb-1">Orders</h1>
          <p className="text-muted-foreground">
            {totalItems} orders
            {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <Button variant="default" onClick={() => handleExportPirateShip('selected')}>
              <Download className="mr-2 h-4 w-4" />
              Export Selected ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" onClick={() => handleExportPirateShip('all')}>
            <Download className="mr-2 h-4 w-4" />
            Export All for Pirate Ship
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center space-x-2 bg-background border rounded-md px-3 py-2 w-full max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
          placeholder="Search by email or order ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search orders"
        />
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 flex-wrap border-b">
        {STATUS_TABS.map((tab) => {
          const tabCount =
            tab === 'all'
              ? orders.length
              : orders.filter((o) => o.status === tab).length;
          return (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setSelectedIds(new Set());
              }}
              className={`px-4 py-2 text-sm capitalize font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.replace('_', ' ')} ({tabCount})
            </button>
          );
        })}
      </div>

      {/* Orders Table */}
      <div className="border rounded-lg overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    filteredOrders.length > 0 &&
                    selectedIds.size === filteredOrders.length
                  }
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all orders"
                />
              </TableHead>
              <TableHead>Order ID</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Total</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No orders found.
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(order.id)}
                      onCheckedChange={() => toggleSelect(order.id)}
                      aria-label={`Select order ${order.orderId}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{order.orderId}</TableCell>
                  <TableCell className="text-sm">{formatDate(order.created)}</TableCell>
                  <TableCell>
                    <div className="text-sm">{order.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {(order.shippingAddress as any)?.firstName}{' '}
                      {(order.shippingAddress as any)?.lastName}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={orderStatusBadgeVariant(order.status)}>
                      {formatOrderStatus(order.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={order.paymentStatus === 'paid' ? 'success' : 'destructive'}
                      className="text-[10px]"
                    >
                      {order.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{formatPrice(order.total)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/admin/orders/${order.id}`}>View</Link>
                    </Button>
                    {order.status !== 'shipped' &&
                      order.status !== 'delivered' &&
                      order.status !== 'cancelled' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setPendingCancel(order)}
                          aria-label={`Cancel order ${order.orderId}`}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!pendingCancel} onOpenChange={(open) => !open && setPendingCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel order {pendingCancel?.orderId}?</AlertDialogTitle>
            <AlertDialogDescription>
              The customer will not be charged. Paid orders must be refunded from
              the order detail page instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={cancelling}
              onClick={handleCancelOrder}
            >
              {cancelling ? 'Cancelling…' : 'Cancel order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
