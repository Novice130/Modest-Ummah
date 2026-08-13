'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Search, Users } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface CustomerData {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  totalOrders: number;
  totalSpent: number;
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    async function loadCustomers() {
      setLoading(true);
      try {
        // Fetch customers through API
        const params = new URLSearchParams({
          page: '1',
          perPage: '50',
          collection: 'users',
        });
        if (search) params.set('filter', `email~"${search}" || name~"${search}"`);

        const res = await fetch(`/api/data?${params}`, {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          setCustomers(data.items || []);
          setTotalCount(data.totalItems || 0);
        } else {
          // Fallback: show empty
          setCustomers([]);
        }
      } catch (e) {
        console.error(e);
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    }
    loadCustomers();
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl">Customers</h1>
          <p className="text-muted-foreground mt-1">
            <Users className="inline h-4 w-4 mr-1" />
            {totalCount} registered users
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2 bg-background border rounded-md px-3 py-2 w-full max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Joined</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Total Spent</TableHead>
              <TableHead>ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-8 text-muted-foreground"
                >
                  No customers found.
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="text-sm">
                    {formatDate(customer.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/customers/${customer.id}`}
                      className="text-primary hover:underline"
                    >
                      {customer.name || 'N/A'}
                    </Link>
                  </TableCell>
                  <TableCell>{customer.email}</TableCell>
                  <TableCell>{customer.totalOrders || 0}</TableCell>
                  <TableCell>
                    {customer.totalSpent
                      ? `$${customer.totalSpent.toFixed(2)}`
                      : '$0.00'}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {customer.id.substring(0, 8)}...
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
