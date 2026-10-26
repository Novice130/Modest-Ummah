'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Download, Loader2, Search, Trash2, Users } from 'lucide-react';
import { formatDate, formatPrice } from '@/lib/utils';
import { stringifyCsv } from '@/lib/csv';
import { useToast } from '@/hooks/use-toast';
import {
  fetchCustomersAdmin,
  fetchNewsletterSubscribersAdmin,
  fetchContactMessagesAdmin,
  removeNewsletterSubscriberAction,
  deleteContactMessageAction,
  type CustomerListItem,
  type CustomerSort,
  type NewsletterSubscriber,
  type ContactMessage,
} from '@/lib/actions/customer.actions';

const PAGE_SIZE = 25;

const SORT_LABELS: Record<CustomerSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  name: 'Name A–Z',
  orders: 'Most orders',
  spent: 'Highest spend',
  lastOrder: 'Recent order',
};

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const blob = new Blob([stringifyCsv(rows, { escapeFormulas: true, lineEnding: '\r\n' })], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Customers tab ──────────────────────────────────────

function CustomersTab() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<CustomerSort>('newest');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce typing so each keystroke is not a database query.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCustomersAdmin({
        page,
        perPage: PAGE_SIZE,
        search: debouncedSearch,
        sort,
      });
      setCustomers(result.items);
      setTotalCount(result.totalItems);
      setTotalPages(result.totalPages);
    } catch (e: any) {
      setError(e?.message || 'Failed to load customers');
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, sort]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center space-x-2 bg-background border rounded-md px-3 py-2 w-full max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
            placeholder="Search by name or email..."
            aria-label="Search customers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {totalCount.toLocaleString()} {debouncedSearch ? 'matching' : 'registered'}
          </span>
          <Select
            value={sort}
            onValueChange={(v) => {
              setSort(v as CustomerSort);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[170px]" aria-label="Sort customers">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as CustomerSort[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border rounded-lg overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Total Spent</TableHead>
              <TableHead>Last Order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <p className="text-destructive mb-2">{error}</p>
                  <Button variant="outline" size="sm" onClick={load}>
                    Retry
                  </Button>
                </TableCell>
              </TableRow>
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  {debouncedSearch ? 'No customers match your search.' : 'No customers yet.'}
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <Link
                      href={`/admin/customers/${customer.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {customer.name || customer.email}
                    </Link>
                    {customer.name && (
                      <p className="text-xs text-muted-foreground">{customer.email}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDate(customer.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">{customer.totalOrders}</TableCell>
                  <TableCell className="text-right">{formatPrice(customer.totalSpent)}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {customer.lastOrderAt ? formatDate(customer.lastOrderAt) : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Orders and spend count paid orders only (spend excludes cancelled and
        refunded), including guest checkouts made with the customer&apos;s email.
      </p>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Subscribers tab ────────────────────────────────────

function SubscribersTab() {
  const { toast } = useToast();
  const [items, setItems] = useState<NewsletterSubscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchNewsletterSubscribersAdmin();
      setItems(result.items);
      setTotal(result.total);
    } catch (e: any) {
      toast({ title: 'Failed to load subscribers', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (email: string) => {
    if (!window.confirm(`Remove ${email} from the newsletter list?`)) return;
    setRemoving(email);
    try {
      await removeNewsletterSubscriberAction(email);
      setItems((prev) => prev.filter((s) => s.email !== email));
      setTotal((t) => Math.max(0, t - 1));
      toast({ title: 'Subscriber removed' });
    } catch (e: any) {
      toast({ title: 'Failed to remove subscriber', description: e?.message, variant: 'destructive' });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString()} sign-up{total === 1 ? '' : 's'} from the newsletter form
          {total > items.length ? ` (showing newest ${items.length})` : ''}.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={items.length === 0}
          onClick={() =>
            downloadCsv('newsletter-subscribers.csv', [
              ['Email', 'Subscribed At'],
              ...items.map((s) => [s.email, s.subscribedAt]),
            ])
          }
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>
      <div className="border rounded-lg overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Subscribed</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  No newsletter sign-ups yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((s) => (
                <TableRow key={s.email}>
                  <TableCell>{s.email}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDate(s.subscribedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={removing === s.email}
                      onClick={() => remove(s.email)}
                      aria-label={`Remove ${s.email}`}
                    >
                      {removing === s.email ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
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

// ─── Messages tab ───────────────────────────────────────

function MessagesTab() {
  const { toast } = useToast();
  const [items, setItems] = useState<ContactMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchContactMessagesAdmin();
      setItems(result.items);
      setTotal(result.total);
    } catch (e: any) {
      toast({ title: 'Failed to load messages', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (msg: ContactMessage) => {
    if (!window.confirm(`Delete the message from ${msg.name || msg.email}?`)) return;
    setDeleting(msg.id);
    try {
      await deleteContactMessageAction(msg.id);
      setItems((prev) => prev.filter((m) => m.id !== msg.id));
      setTotal((t) => Math.max(0, t - 1));
      toast({ title: 'Message deleted' });
    } catch (e: any) {
      toast({ title: 'Failed to delete message', description: e?.message, variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="py-8 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {total.toLocaleString()} message{total === 1 ? '' : 's'} from the contact form
        {total > items.length ? ` (showing newest ${items.length})` : ''}. The form
        does not send email; reply from your own mailbox.
      </p>
      {items.length === 0 ? (
        <div className="border rounded-lg bg-card py-8 text-center text-muted-foreground">
          No messages yet.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((m) => (
            <div key={m.id} className="border rounded-lg bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium break-words">{m.subject || '(no subject)'}</p>
                  <p className="text-sm text-muted-foreground break-all">
                    {m.name && `${m.name} · `}
                    <a
                      href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}
                      className="text-primary hover:underline"
                    >
                      {m.email}
                    </a>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                    {formatDate(m.receivedAt)}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleting === m.id}
                    onClick={() => remove(m)}
                    aria-label="Delete message"
                  >
                    {deleting === m.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-sm whitespace-pre-wrap break-words">{m.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminCustomersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl">Customers</h1>
        <p className="text-muted-foreground mt-1">
          <Users className="inline h-4 w-4 mr-1" />
          Registered accounts, newsletter sign-ups and contact-form messages.
        </p>
      </div>

      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>
        <TabsContent value="customers" className="mt-4">
          <CustomersTab />
        </TabsContent>
        <TabsContent value="subscribers" className="mt-4">
          <SubscribersTab />
        </TabsContent>
        <TabsContent value="messages" className="mt-4">
          <MessagesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
