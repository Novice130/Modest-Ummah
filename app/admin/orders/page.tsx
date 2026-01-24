'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getOrders, updateOrder, getAllOrders } from '@/lib/pocketbase';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Loader2, Download, ExternalLink, Copy, Check } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import type { Order } from '@/types';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Pirate Ship Export Logic
  const handleExportPirateShip = () => {
    // Pirate Ship CSV Header Format
    const headers = [
      'Order ID', 'Order Date', 'Recipient Name', 'Company', 
      'Address Line 1', 'Address Line 2', 'City', 'State/Province', 'Zip/Postal Code', 'Country', 
      'Email', 'Phone', 'Package Weight (oz)', 'Order Total'
    ];
    
    const rows = orders.map(order => {
      // Safely access shipping address fields
      const addr = order.shippingAddress as any || {};
      
      return [
        order.orderId,
        order.created,
        addr.firstName + ' ' + addr.lastName,
        '', // Company
        addr.address1,
        addr.address2 || '',
        addr.city,
        addr.state || '',
        addr.postalCode,
        addr.country || 'US',
        order.email,
        addr.phone || '',
        '10', // Default weight placeholder (can calculate from items if weights exist)
        order.total
      ].map(field => `"${String(field || '').replace(/"/g, '""')}"`).join(','); // Escape quotes
    });
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `pirate_ship_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    setLoading(true);
    try {
      console.log('Fetching admin orders...');
      const result = await getAllOrders(1, 100, search ? `email~"${search}" || orderId~"${search}"` : '');
      console.log('Orders result:', result);
      setOrders(result.items);
    } catch (e) {
      console.error('Error fetching orders:', e);
    } finally {
      setLoading(false);
    }
  }
  
  // We need to update lib/pocketbase.ts to support fetching ALL orders for admin.
  // I will write this file, but then fix pocketbase.ts immediately.
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl mb-2">Orders</h1>
          <p className="text-muted-foreground">Manage customer orders and shipping.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPirateShip}>
            <Download className="mr-2 h-4 w-4" />
            Export for Pirate Ship
          </Button>
        </div>
      </div>
      
      {/* Search Bar - Placeholder for now */}
      <div className="flex items-center space-x-2 bg-background border rounded-md px-3 py-2 w-full max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input 
          className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
          placeholder="Search orders..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="border rounded-lg overflow-hidden bg-card">
         <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No orders found.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs">{order.orderId}</TableCell>
                  <TableCell>{formatDate(order.created)}</TableCell>
                  <TableCell>
                    {order.email}
                    <div className="text-xs text-muted-foreground">
                      {(order.shippingAddress as any)?.firstName} {(order.shippingAddress as any)?.lastName}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={order.status === 'delivered' ? 'default' : order.status === 'shipped' ? 'secondary' : 'outline'}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatPrice(order.total)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/admin/orders/${order.id}`}>
                        View
                      </Link>
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
