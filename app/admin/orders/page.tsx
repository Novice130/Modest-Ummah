'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Loader2,
  Download,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  fetchAllOrdersAdmin,
  cancelOrderAction,
  type AdminOrder,
} from '@/lib/actions/order.actions';
import {
  orderStatusBadgeVariant,
  formatOrderStatus,
  paymentStatusBadgeVariant,
  formatPaymentStatus,
  canTransition,
  PAYMENT_STATUSES,
  type OrderListTab,
  type OrderListSort,
  type OrderListFilters,
} from '@/lib/order-status';

const TABS: Array<{ value: OrderListTab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unfulfilled', label: 'Unfulfilled' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'pending_payment', label: 'Awaiting payment' },
];

const SORTS: Array<{ value: OrderListSort; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'total_desc', label: 'Total: high to low' },
  { value: 'total_asc', label: 'Total: low to high' },
];

const PAGE_SIZE = 25;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** <input type="date"> value (admin's local day) → inclusive ISO bound. */
function localDayBound(value: string, end: boolean): string | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

type TabCounts = Record<OrderListTab, number>;

export default function AdminOrdersPage() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState<OrderListTab>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('any');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<OrderListSort>('newest');
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [tabCounts, setTabCounts] = useState<TabCounts | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingCancel, setPendingCancel] = useState<AdminOrder | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requestId = useRef(0);

  // Debounce search to avoid a fetch per keystroke.
  useEffect(() => {
    const next = search.trim();
    if (next === debouncedSearch) return;
    const t = setTimeout(() => {
      setDebouncedSearch(next);
      setPage(1);
      setSelectedIds(new Set());
    }, 300);
    return () => clearTimeout(t);
  }, [search, debouncedSearch]);

  const currentFilters = useCallback(
    (): OrderListFilters => ({
      tab: activeTab,
      search: debouncedSearch || undefined,
      paymentStatus: paymentFilter === 'any' ? undefined : paymentFilter,
      dateFrom: localDayBound(dateFrom, false),
      dateTo: localDayBound(dateTo, true),
    }),
    [activeTab, debouncedSearch, paymentFilter, dateFrom, dateTo]
  );

  const loadOrders = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchAllOrdersAdmin({
        ...currentFilters(),
        page,
        limit: PAGE_SIZE,
        sort,
      });
      // Ignore responses that arrive after a newer request was sent.
      if (id !== requestId.current) return;
      setOrders(result.items);
      setTotalItems(result.totalItems);
      setTotalPages(result.totalPages);
      setTabCounts(result.tabCounts);
      if (page > result.totalPages) setPage(result.totalPages);
    } catch (e: any) {
      if (id !== requestId.current) return;
      setLoadError(e?.message || 'Something went wrong.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [currentFilters, page, sort]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Any filter change returns to page 1 and drops the selection. Done in the
  // same batch as the filter update so it costs one fetch, not two.
  const resetPaging = () => {
    setPage(1);
    setSelectedIds(new Set());
  };
  const withReset =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      resetPaging();
    };

  const filtersActive =
    Boolean(search) || paymentFilter !== 'any' || Boolean(dateFrom) || Boolean(dateTo);

  const clearFilters = () => {
    resetPaging();
    setSearch('');
    setPaymentFilter('any');
    setDateFrom('');
    setDateTo('');
  };

  // ─── Export (server route; covers every matching row, not just this page) ───

  const handleExport = async (format: 'pirateship' | 'orders', scope: 'selected' | 'all') => {
    if (scope === 'selected' && selectedIds.size === 0) return;
    setExporting(true);
    try {
      const res = await fetch('/api/admin/orders/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          orderIds: scope === 'selected' ? Array.from(selectedIds) : undefined,
          filters: scope === 'all' ? currentFilters() : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Export failed');
      }
      const exported = Number(res.headers.get('X-Export-Count') || 0);
      const skipped = Number(res.headers.get('X-Export-Skipped') || 0);
      if (exported === 0) {
        toast({
          title: 'Nothing to export',
          description:
            format === 'pirateship'
              ? 'No paid, unshipped orders match. Pirate Ship exports skip unpaid, shipped and cancelled orders.'
              : 'No orders match the current filters.',
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = format === 'pirateship' ? `pirate_ship_export_${date}.csv` : `orders_${date}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({
        title: `Exported ${exported} order${exported === 1 ? '' : 's'}`,
        description: skipped
          ? `${skipped} skipped (unpaid, already shipped or cancelled).`
          : undefined,
      });
    } catch (e: any) {
      toast({
        title: 'Export failed',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  // ─── Selection ─────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allOnPageSelected = orders.length > 0 && orders.every((o) => selectedIds.has(o.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) orders.forEach((o) => next.delete(o.id));
      else orders.forEach((o) => next.add(o.id));
      return next;
    });
  };

  const handleCancelOrder = async () => {
    if (!pendingCancel) return;
    setCancelling(true);
    try {
      await cancelOrderAction(pendingCancel.id);
      toast({ title: `Order ${pendingCancel.orderId} cancelled` });
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

  const rangeStart = totalItems === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalItems);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl mb-1">Orders</h1>
          <p className="text-muted-foreground">
            {totalItems} {activeTab === 'pending_payment' ? 'unpaid checkouts' : 'orders'}
            {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={exporting}>
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Pirate Ship CSV (paid, unshipped)</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={selectedIds.size === 0}
              onSelect={() => handleExport('pirateship', 'selected')}
            >
              Selected orders ({selectedIds.size})
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleExport('pirateship', 'all')}>
              All orders matching filters
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Orders CSV (bookkeeping)</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={selectedIds.size === 0}
              onSelect={() => handleExport('orders', 'selected')}
            >
              Selected orders ({selectedIds.size})
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleExport('orders', 'all')}>
              All orders matching filters ({totalItems})
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-end gap-3">
        <div className="flex items-center space-x-2 bg-background border rounded-md px-3 h-10 w-full lg:max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
            placeholder="Order #, email, name or tracking…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search orders"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Payment</Label>
            <Select value={paymentFilter} onValueChange={withReset(setPaymentFilter)}>
              <SelectTrigger aria-label="Filter by payment status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any payment</SelectItem>
                {PAYMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {formatPaymentStatus(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="orders-from" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="orders-from"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => withReset(setDateFrom)(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="orders-to" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="orders-to"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => withReset(setDateTo)(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Sort</Label>
            <Select value={sort} onValueChange={(v) => withReset(setSort)(v as OrderListSort)}>
              <SelectTrigger aria-label="Sort orders">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {filtersActive && (
          <Button variant="ghost" onClick={clearFilters}>
            <RotateCcw className="mr-2 h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      {/* Status Tabs (counts honour search, payment and date filters) */}
      <div className="flex gap-1 flex-wrap border-b" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => withReset(setActiveTab)(tab.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tabCounts ? ` (${tabCounts[tab.value]})` : ''}
          </button>
        ))}
      </div>

      {activeTab === 'pending_payment' && (
        <p className="text-sm text-muted-foreground">
          Checkouts that reached the payment step but were never paid. They are
          not shown under All and are never exported to Pirate Ship. Stripe moves
          them to Processing automatically if the payment completes.
        </p>
      )}

      {/* Orders Table */}
      <div className="border rounded-lg overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all orders on this page"
                />
              </TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Fulfillment</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : loadError ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <p className="text-destructive mb-3">Failed to load orders: {loadError}</p>
                  <Button variant="outline" size="sm" onClick={loadOrders}>
                    Retry
                  </Button>
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  {filtersActive ? 'No orders match these filters.' : 'No orders here yet.'}
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id} className={loading ? 'opacity-60' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(order.id)}
                      onCheckedChange={() => toggleSelect(order.id)}
                      aria-label={`Select order ${order.orderId}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-mono text-xs font-medium hover:underline"
                    >
                      {order.orderId}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDateTime(order.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{order.customerName || '—'}</div>
                    <div className="text-xs text-muted-foreground">{order.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">{order.itemCount}</TableCell>
                  <TableCell>
                    <Badge variant={paymentStatusBadgeVariant(order.paymentStatus)}>
                      {formatPaymentStatus(order.paymentStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={orderStatusBadgeVariant(order.status)}>
                      {formatOrderStatus(order.status)}
                    </Badge>
                    {order.trackingNumber && (
                      <div className="text-[11px] text-muted-foreground mt-1 font-mono">
                        {order.trackingCarrier} {order.trackingNumber}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPrice(order.total)}
                  </TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/admin/orders/${order.id}`}>View</Link>
                    </Button>
                    {canTransition(order, 'cancelled') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setPendingCancel(order)}
                        aria-label={`Cancel order ${order.orderId}`}
                        title="Cancel unpaid order"
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

      {/* Pagination */}
      {totalItems > 0 && (
        <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>
            Showing {rangeStart}–{rangeEnd} of {totalItems}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!pendingCancel} onOpenChange={(open) => !open && setPendingCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel order {pendingCancel?.orderId}?</AlertDialogTitle>
            <AlertDialogDescription>
              This order has not been paid, so nothing is charged or refunded and
              no stock is returned. Cancelled orders cannot be reopened.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                handleCancelOrder();
              }}
            >
              {cancelling ? 'Cancelling…' : 'Cancel order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
