'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getAllOrders } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, Loader2, Download, CheckSquare, Square } from 'lucide-react';
import { formatPrice, formatDate } from '@/lib/utils';
import type { Order } from '@/types';
import { Badge } from '@/components/ui/badge';
import type { ShippingAddressDB, OrderItem } from '@/lib/schema';

const STATUS_TABS = ['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'] as const;

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadOrders();
  }, [search]);

  async function loadOrders() {
    setLoading(true);
    try {
      const result = await getAllOrders(
        1,
        100,
        search ? `email~"${search}" || orderId~"${search}"` : ''
      );
      setOrders(result.items);
    } catch (e) {
      console.error('Error fetching orders:', e);
    } finally {
      setLoading(false);
    }
  }

  // Filter by status tab
  const filteredOrders =
    activeTab === 'all'
      ? orders
      : orders.filter((o) => o.status === activeTab);

  // ─── Pirate Ship CSV Export (Exact Format Match) ────────

  const handleExportPirateShip = (exportType: 'selected' | 'all') => {
    const ordersToExport =
      exportType === 'selected'
        ? filteredOrders.filter((o) => selectedIds.has(o.id))
        : filteredOrders;

    if (ordersToExport.length === 0) {
      alert('No orders to export.');
      return;
    }

    // Exact Pirate Ship CSV header format from the sample
    const headers = [
      'Name',
      'Company',
      'Email',
      'Phone',
      'Address Line 1',
      'Address Line 2',
      'City',
      'State',
      'Zip',
      'Country',
      'Weight (oz)',
      'Length (in)',
      'Width (in)',
      'Height (in)',
      'Order ID',
    ];

    const rows = ordersToExport.map((order) => {
      const addr = (order.shippingAddress || {}) as ShippingAddressDB;
      const fullName = `${addr.firstName || ''} ${addr.lastName || ''}`.trim();

      // Parse items to estimate weight
      let itemsArray: OrderItem[] = [];
      try {
        itemsArray =
          typeof order.items === 'string'
            ? JSON.parse(order.items)
            : (order.items as unknown as OrderItem[]) || [];
      } catch {
        itemsArray = [];
      }

      // Estimate total weight: 8 oz per item (standard US small parcel)
      const totalWeight = itemsArray.reduce(
        (sum, item) => sum + item.quantity * 8,
        0
      );

      return [
        fullName,                    // Name
        'Modest Ummah',              // Company
        order.email,                 // Email
        addr.phone || '',            // Phone
        addr.address1 || '',         // Address Line 1
        addr.address2 || '',         // Address Line 2
        addr.city || '',             // City
        addr.state || '',            // State
        addr.postalCode || '',       // Zip
        addr.country || 'US',        // Country
        String(totalWeight || 16),   // Weight (oz) - default 16 oz (1 lb)
        '12',                        // Length (in) - standard US small parcel
        '9',                         // Width (in)
        '4',                         // Height (in)
        order.orderId,               // Order ID
      ]
        .map((field) => String(field || '').replace(/,/g, ' '))
        .join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `pirate_ship_export_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
    if (selectedIds.size === filteredOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map((o) => o.id)));
    }
  };

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'default' as const;
      case 'shipped':
        return 'secondary' as const;
      case 'processing':
        return 'outline' as const;
      case 'cancelled':
        return 'destructive' as const;
      default:
        return 'outline' as const;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl mb-1">Orders</h1>
          <p className="text-muted-foreground">
            {filteredOrders.length} orders
            {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <Button
              variant="default"
              onClick={() => handleExportPirateShip('selected')}
            >
              <Download className="mr-2 h-4 w-4" />
              Export Selected ({selectedIds.size})
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => handleExportPirateShip('all')}
          >
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
              {tab} ({tabCount})
            </button>
          );
        })}
      </div>

      {/* Orders Table */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <button onClick={toggleSelectAll} className="p-1">
                  {selectedIds.size === filteredOrders.length &&
                  filteredOrders.length > 0 ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
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
                <TableCell
                  colSpan={8}
                  className="text-center py-8 text-muted-foreground"
                >
                  No orders found.
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <button
                      onClick={() => toggleSelect(order.id)}
                      className="p-1"
                    >
                      {selectedIds.has(order.id) ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {order.orderId}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(order.created)}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{order.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {(order.shippingAddress as any)?.firstName}{' '}
                      {(order.shippingAddress as any)?.lastName}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(order.status)}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        order.paymentStatus === 'paid'
                          ? 'default'
                          : 'destructive'
                      }
                      className="text-[10px]"
                    >
                      {order.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatPrice(order.total)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/admin/orders/${order.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
