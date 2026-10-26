'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Plus,
  Search,
  Trash2,
  Edit,
  Loader2,
  Tag,
  TicketPercent,
  Percent,
  DollarSign,
  Shuffle,
  X,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { formatPrice, cn } from '@/lib/utils';
import {
  fetchCouponsAdmin,
  createCouponAction,
  updateCouponAction,
  deleteCouponAction,
  toggleCouponAction,
  type AdminCoupon,
  type CouponStatus,
} from '@/lib/actions/coupon.actions';
import { fetchCategoriesAdmin } from '@/lib/actions/category.actions';
import { fetchProductPickerOptions } from '@/lib/actions/product.actions';

const PAGE_SIZE = 25;

type Scope = 'all' | 'category' | 'products';

interface CouponFormState {
  code: string;
  type: 'percentage' | 'fixed';
  amount: string;
  minSpend: string;
  usageLimit: string;
  /** datetime-local value (browser timezone), '' for none. */
  startsAt: string;
  expiresAt: string;
  enabled: boolean;
  scope: Scope;
  categoryId: string;
  products: Array<{ id: string; name: string }>;
}

const EMPTY_FORM: CouponFormState = {
  code: '',
  type: 'percentage',
  amount: '',
  minSpend: '',
  usageLimit: '',
  startsAt: '',
  expiresAt: '',
  enabled: true,
  scope: 'all',
  categoryId: '',
  products: [],
};

interface CategoryOption {
  id: string;
  name: string;
  depth: number;
}

/** ISO instant -> value for <input type="datetime-local"> in the browser's timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value (browser timezone) -> ISO instant. */
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I lookalikes
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Same precedence as statusCondition() in coupon.actions.ts. */
function couponStatus(coupon: AdminCoupon): { label: string; className: string } {
  if (!coupon.enabled) return { label: 'Disabled', className: 'bg-muted text-muted-foreground' };
  const now = Date.now();
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now) {
    return { label: 'Expired', className: 'bg-red-500 text-white' };
  }
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) {
    return { label: 'Scheduled', className: 'bg-blue-500 text-white' };
  }
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { label: 'Used up', className: 'bg-rose-300 text-white' };
  }
  return { label: 'Active', className: 'bg-green-500 text-white' };
}

function appliesTo(coupon: AdminCoupon): string {
  if (coupon.productIds.length > 0) {
    const names = coupon.products.map((p) => p.name);
    const missing = coupon.productIds.length - names.length;
    if (names.length === 0) return `${coupon.productIds.length} deleted product(s)`;
    const shown = names.slice(0, 2).join(', ');
    const more = names.length - 2 + missing;
    return more > 0 ? `${shown} +${more} more` : shown;
  }
  if (coupon.categoryId) return `${coupon.categoryName ?? 'Unknown category'} (incl. subcategories)`;
  return 'All products';
}

/** Mirrors cleanInput() in coupon.actions.ts so mistakes show before the round trip. */
function validate(form: CouponFormState): string | null {
  const code = form.code.trim();
  if (!code) return 'Enter a coupon code.';
  if (!/^[A-Z0-9-]+$/.test(code)) return 'Codes may only contain letters, numbers, and dashes.';
  const amount = Number(form.amount);
  if (form.amount === '' || !Number.isFinite(amount)) return 'Enter the discount amount.';
  if (form.type === 'percentage' && (amount < 1 || amount > 100)) {
    return 'Percentage discount must be between 1 and 100.';
  }
  if (form.type === 'fixed' && amount <= 0) return 'Fixed discount must be more than $0.';
  if (form.usageLimit !== '') {
    const n = Number(form.usageLimit);
    if (!Number.isInteger(n) || n < 1) return 'Usage limit must be a whole number of 1 or more.';
  }
  if (form.minSpend !== '' && !(Number(form.minSpend) >= 0)) {
    return 'Minimum order subtotal must be zero or more.';
  }
  const start = fromLocalInput(form.startsAt);
  const end = fromLocalInput(form.expiresAt);
  if (start && end && end <= start) return 'The end date must be after the start date.';
  if (form.scope === 'category' && !form.categoryId) return 'Choose a category.';
  if (form.scope === 'products' && form.products.length === 0) return 'Choose at least one product.';
  return null;
}

export default function AdminCouponsPage() {
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<CouponStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCoupon | null>(null);
  const [form, setForm] = useState<CouponFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminCoupon | null>(null);
  const [deleting, setDeleting] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<Array<{ id: string; name: string; sku: string }>>([]);
  const [productSearching, setProductSearching] = useState(false);

  const timeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'your local time';
    }
  }, []);

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

  const loadCoupons = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchCouponsAdmin(page, PAGE_SIZE, {
        search: debouncedSearch,
        status,
      });
      setCoupons(result.items);
      setTotalItems(result.totalItems);
      setTotalPages(result.totalPages);
    } catch (e: any) {
      setLoadError(e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, status]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  // Category tree for the restriction picker, flattened with depth.
  const loadCategories = useCallback(async () => {
    try {
      const rows = await fetchCategoriesAdmin();
      const children = new Map<string | null, typeof rows>();
      const ids = new Set(rows.map((r) => r.id));
      for (const r of rows) {
        const key = r.parentId && ids.has(r.parentId) ? r.parentId : null;
        children.set(key, [...(children.get(key) ?? []), r]);
      }
      const out: CategoryOption[] = [];
      const walk = (parent: string | null, depth: number) => {
        for (const r of children.get(parent) ?? []) {
          out.push({ id: r.id, name: r.name, depth });
          walk(r.id, depth + 1);
        }
      };
      walk(null, 0);
      setCategoryOptions(out);
    } catch {
      setCategoryOptions([]);
    }
  }, []);

  // Product search for the restriction picker.
  useEffect(() => {
    if (!formOpen || form.scope !== 'products') return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setProductSearching(true);
      try {
        const rows = await fetchProductPickerOptions(productQuery.trim(), 12);
        if (!cancelled) setProductResults(rows);
      } catch {
        if (!cancelled) setProductResults([]);
      } finally {
        if (!cancelled) setProductSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [productQuery, formOpen, form.scope]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setProductQuery('');
    loadCategories();
    setFormOpen(true);
  };

  const openEdit = (coupon: AdminCoupon) => {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      type: coupon.type,
      amount: String(coupon.amount),
      minSpend: coupon.minSpend === null ? '' : String(coupon.minSpend),
      usageLimit: coupon.usageLimit === null ? '' : String(coupon.usageLimit),
      startsAt: toLocalInput(coupon.startsAt),
      expiresAt: toLocalInput(coupon.expiresAt),
      enabled: coupon.enabled,
      scope: coupon.productIds.length > 0 ? 'products' : coupon.categoryId ? 'category' : 'all',
      categoryId: coupon.categoryId ?? '',
      products: coupon.products,
    });
    setProductQuery('');
    loadCategories();
    setFormOpen(true);
  };

  const handleSave = async () => {
    const problem = validate(form);
    if (problem) {
      toast({ title: 'Check the coupon', description: problem, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        type: form.type,
        amount: Number(form.amount),
        minSpend: form.minSpend === '' ? null : Number(form.minSpend),
        usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
        startsAt: fromLocalInput(form.startsAt),
        expiresAt: fromLocalInput(form.expiresAt),
        enabled: form.enabled,
        categoryId: form.scope === 'category' ? form.categoryId : null,
        productIds: form.scope === 'products' ? form.products.map((p) => p.id) : [],
      };
      if (editing) {
        await updateCouponAction(editing.id, payload);
        toast({ title: 'Coupon updated' });
      } else {
        await createCouponAction(payload);
        toast({ title: 'Coupon created' });
      }
      setFormOpen(false);
      loadCoupons();
    } catch (e: any) {
      toast({
        title: editing ? 'Failed to update coupon' : 'Failed to create coupon',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (coupon: AdminCoupon) => {
    setTogglingId(coupon.id);
    try {
      await toggleCouponAction(coupon.id, !coupon.enabled);
      await loadCoupons();
    } catch (e: any) {
      toast({
        title: 'Failed to update coupon',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteCouponAction(pendingDelete.id);
      toast({ title: 'Coupon deleted' });
      setPendingDelete(null);
      // Deleting the last row on a page would otherwise leave an empty page.
      if (coupons.length === 1 && page > 1) setPage((p) => p - 1);
      else loadCoupons();
    } catch (e: any) {
      toast({
        title: 'Failed to delete coupon',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const discountLabel = (coupon: AdminCoupon) =>
    coupon.type === 'percentage' ? `${coupon.amount}% off` : `${formatPrice(coupon.amount)} off`;

  const addProduct = (p: { id: string; name: string }) =>
    setForm((f) =>
      f.products.some((x) => x.id === p.id) ? f : { ...f, products: [...f.products, { id: p.id, name: p.name }] }
    );
  const removeProduct = (id: string) =>
    setForm((f) => ({ ...f, products: f.products.filter((p) => p.id !== id) }));

  const filtered = !!debouncedSearch.trim() || status !== 'all';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-3xl mb-2">Coupons</h1>
          <p className="text-muted-foreground">
            {totalItems} {totalItems === 1 ? 'coupon' : 'coupons'}
            {filtered ? ' match' : ''}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add New Coupon
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center space-x-2 bg-background border rounded-md px-3 py-2 w-full max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
            placeholder="Search by code or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search coupons"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as CouponStatus | 'all');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="used_up">Used up</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead>Used</TableHead>
              <TableHead>Active dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && coupons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : loadError ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <p className="flex items-center justify-center gap-2 text-destructive mb-2">
                    <AlertCircle className="h-4 w-4" />
                    Could not load coupons: {loadError}
                  </p>
                  <Button variant="outline" size="sm" onClick={loadCoupons}>
                    Retry
                  </Button>
                </TableCell>
              </TableRow>
            ) : coupons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {filtered ? 'No coupons match these filters.' : 'No coupons yet. Create your first one!'}
                </TableCell>
              </TableRow>
            ) : (
              coupons.map((coupon) => {
                const st = couponStatus(coupon);
                return (
                  <TableRow key={coupon.id} className={cn(loading && 'opacity-60')}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 font-mono font-semibold">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        {coupon.code}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        {coupon.type === 'percentage' ? (
                          <Percent className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <DollarSign className="h-3 w-3 text-muted-foreground" />
                        )}
                        {discountLabel(coupon)}
                      </span>
                      {coupon.minSpend !== null && coupon.minSpend > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Orders over {formatPrice(coupon.minSpend)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm max-w-[220px] truncate" title={appliesTo(coupon)}>
                      {appliesTo(coupon)}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {coupon.usageCount}
                      {coupon.usageLimit !== null ? ` / ${coupon.usageLimit}` : ''}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div>{coupon.startsAt ? formatDateTime(coupon.startsAt) : 'From creation'}</div>
                      <div>{coupon.expiresAt ? `to ${formatDateTime(coupon.expiresAt)}` : 'No end date'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={coupon.enabled}
                          disabled={togglingId === coupon.id}
                          onCheckedChange={() => handleToggle(coupon)}
                          aria-label={coupon.enabled ? `Disable ${coupon.code}` : `Enable ${coupon.code}`}
                        />
                        <Badge className={cn(st.className, 'whitespace-nowrap')}>{st.label}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(coupon)}
                        aria-label={`Edit ${coupon.code}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setPendingDelete(coupon)}
                        aria-label={`Delete ${coupon.code}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => !saving && setFormOpen(open)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TicketPercent className="h-5 w-5" />
              {editing ? `Edit ${editing.code}` : 'New Coupon'}
            </DialogTitle>
            <DialogDescription>
              Checkout re-checks every rule below against the database before charging.
              {editing && editing.usageCount > 0
                ? ` Used ${editing.usageCount} time${editing.usageCount === 1 ? '' : 's'} so far.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="coupon-code">Code</Label>
              <div className="flex gap-2">
                <Input
                  id="coupon-code"
                  value={form.code}
                  onChange={(e) =>
                    setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, '') })
                  }
                  placeholder="WELCOME10"
                  maxLength={40}
                  className="font-mono uppercase"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForm({ ...form, code: randomCode() })}
                  title="Generate a random code"
                >
                  <Shuffle className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Customers can type it in any case. Letters, numbers and dashes only.
                {editing && editing.usageCount > 0 && form.code.trim() !== editing.code
                  ? ' Unpaid orders placed with the old code will not count toward usage.'
                  : ''}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="coupon-type">Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v as 'percentage' | 'fixed' })}
                >
                  <SelectTrigger id="coupon-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-amount">
                  {form.type === 'percentage' ? 'Percent off (1–100)' : 'Amount off ($)'}
                </Label>
                <Input
                  id="coupon-amount"
                  type="number"
                  min={form.type === 'percentage' ? '1' : '0.01'}
                  max={form.type === 'percentage' ? '100' : undefined}
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder={form.type === 'percentage' ? '10' : '5.00'}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              {form.type === 'percentage'
                ? 'Taken off the price of each eligible item.'
                : 'Taken once off the order, never more than the eligible items cost.'}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="coupon-min-spend">Minimum order subtotal ($)</Label>
                <Input
                  id="coupon-min-spend"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minSpend}
                  onChange={(e) => setForm({ ...form, minSpend: e.target.value })}
                  placeholder="None"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-usage-limit">Total uses allowed</Label>
                <Input
                  id="coupon-usage-limit"
                  type="number"
                  min="1"
                  step="1"
                  value={form.usageLimit}
                  onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Minimum is checked against the whole cart before discount, shipping and tax. A use
              is counted when an order is paid.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="coupon-starts">Starts</Label>
                <Input
                  id="coupon-starts"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-expires">Ends</Label>
                <Input
                  id="coupon-expires"
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Times are in {timeZone}. Leave Starts empty to start now and Ends empty to never
              expire.
            </p>

            <div className="space-y-2">
              <Label htmlFor="coupon-scope">Applies to</Label>
              <Select
                value={form.scope}
                onValueChange={(v) => setForm({ ...form, scope: v as Scope })}
              >
                <SelectTrigger id="coupon-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All products</SelectItem>
                  <SelectItem value="category">A category</SelectItem>
                  <SelectItem value="products">Specific products</SelectItem>
                </SelectContent>
              </Select>

              {form.scope === 'category' && (
                <>
                  <Select
                    value={form.categoryId || undefined}
                    onValueChange={(v) => setForm({ ...form, categoryId: v })}
                  >
                    <SelectTrigger aria-label="Category">
                      <SelectValue placeholder="Choose a category…" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((opt) => (
                        <SelectItem key={opt.id} value={opt.id}>
                          {' '.repeat(opt.depth * 3)}
                          {opt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Includes every subcategory beneath it.
                  </p>
                </>
              )}

              {form.scope === 'products' && (
                <div className="space-y-2 rounded-md border p-3">
                  {form.products.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {form.products.map((p) => (
                        <Badge key={p.id} variant="secondary" className="gap-1">
                          {p.name}
                          <button
                            type="button"
                            onClick={() => removeProduct(p.id)}
                            aria-label={`Remove ${p.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <Input
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Search products by name or SKU"
                    aria-label="Search products"
                  />
                  <div className="max-h-40 overflow-y-auto divide-y text-sm">
                    {productSearching ? (
                      <p className="py-2 text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                      </p>
                    ) : productResults.length === 0 ? (
                      <p className="py-2 text-muted-foreground">No published products found.</p>
                    ) : (
                      productResults.map((p) => {
                        const picked = form.products.some((x) => x.id === p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            disabled={picked}
                            onClick={() => addProduct(p)}
                            className="w-full text-left py-1.5 px-1 hover:bg-muted disabled:opacity-50"
                          >
                            {p.name}
                            {p.sku ? (
                              <span className="text-xs text-muted-foreground ml-2">{p.sku}</span>
                            ) : null}
                            {picked ? <span className="text-xs ml-2">(added)</span> : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="coupon-enabled" className="cursor-pointer">Enabled</Label>
                <p className="text-xs text-muted-foreground">
                  Turn off to pause the coupon without deleting it.
                </p>
              </div>
              <Switch
                id="coupon-enabled"
                checked={form.enabled}
                onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Coupon'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              The code stops working immediately. Orders that already used it keep their
              discount.
              {pendingDelete && pendingDelete.usageCount > 0
                ? ` It has been used ${pendingDelete.usageCount} time${pendingDelete.usageCount === 1 ? '' : 's'}; disabling it keeps that history.`
                : ''}{' '}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
