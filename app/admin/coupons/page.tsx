'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Search, Trash2, Edit, Loader2, Tag, TicketPercent, Percent, DollarSign } from 'lucide-react';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { formatPrice, formatDate, cn } from '@/lib/utils';
import {
  fetchCouponsAdmin,
  createCouponAction,
  updateCouponAction,
  deleteCouponAction,
  toggleCouponAction,
  type AdminCoupon,
} from '@/lib/actions/coupon.actions';

const PAGE_SIZE = 25;

interface CouponFormState {
  code: string;
  type: 'percentage' | 'fixed';
  amount: string;
  minSpend: string;
  usageLimit: string;
  expiresAt: string;
  startsAt: string;
  enabled: boolean;
  category: string;
}

const EMPTY_FORM: CouponFormState = {
  code: '',
  type: 'percentage',
  amount: '',
  minSpend: '',
  usageLimit: '',
  expiresAt: '',
  startsAt: '',
  enabled: true,
  category: '',
};

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

export default function AdminCouponsPage() {
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCoupon | null>(null);
  const [form, setForm] = useState<CouponFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminCoupon | null>(null);
  const [deleting, setDeleting] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    try {
      const result = await fetchCouponsAdmin(page, PAGE_SIZE, { search: debouncedSearch });
      setCoupons(result.items);
      setTotalItems(result.totalItems);
      setTotalPages(result.totalPages);
    } catch (e: any) {
      toast({
        title: 'Failed to load coupons',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, toast]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
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
      expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : '',
      startsAt: coupon.startsAt ? coupon.startsAt.slice(0, 10) : '',
      enabled: coupon.enabled,
      category: coupon.category || '',
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        code: form.code,
        type: form.type,
        amount: Number(form.amount),
        minSpend: form.minSpend === '' ? null : Number(form.minSpend),
        usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
        expiresAt: form.expiresAt || null,
        startsAt: form.startsAt || null,
        enabled: form.enabled,
        category: form.category || null,
        productIds: editing?.productIds || [],
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
    try {
      await toggleCouponAction(coupon.id, !coupon.enabled);
      loadCoupons();
    } catch (e: any) {
      toast({
        title: 'Failed to update coupon',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteCouponAction(pendingDelete.id);
      toast({ title: 'Coupon deleted' });
      setPendingDelete(null);
      loadCoupons();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-3xl mb-2">Coupons</h1>
          <p className="text-muted-foreground">{totalItems} coupons found</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add New Coupon
        </Button>
      </div>

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

      <div className="border rounded-lg overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Valid</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : coupons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No coupons found. Create your first one!
                </TableCell>
              </TableRow>
            ) : (
              coupons.map((coupon) => {
                const status = couponStatus(coupon);
                return (
                  <TableRow key={coupon.id}>
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
                    </TableCell>
                    <TableCell className="text-sm">
                      {coupon.usageCount} / {coupon.usageLimit ?? '∞'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {coupon.startsAt ? `From ${formatDate(coupon.startsAt)}` : 'Now'}
                      {coupon.expiresAt && ` — ${formatDate(coupon.expiresAt)}`}
                      {coupon.minSpend !== null && (
                        <div>Min {formatPrice(coupon.minSpend)}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(status.className)}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={coupon.enabled}
                        onCheckedChange={() => handleToggle(coupon)}
                        aria-label={`Toggle ${coupon.code}`}
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TicketPercent className="h-5 w-5" />
              {editing ? `Edit ${editing.code}` : 'New Coupon'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Coupons are validated server-side at checkout.'
                : 'Create a promo code. Discounts are always recomputed from the database at checkout.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="coupon-code">Code</Label>
              <Input
                id="coupon-code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="WELCOME10"
                className="font-mono uppercase"
              />
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
                  {form.type === 'percentage' ? 'Percent off' : 'Amount off ($)'}
                </Label>
                <Input
                  id="coupon-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder={form.type === 'percentage' ? '10' : '5.00'}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="coupon-min-spend">Minimum spend ($)</Label>
                <Input
                  id="coupon-min-spend"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minSpend}
                  onChange={(e) => setForm({ ...form, minSpend: e.target.value })}
                  placeholder="Leave empty for none"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-usage-limit">Usage limit</Label>
                <Input
                  id="coupon-usage-limit"
                  type="number"
                  min="0"
                  step="1"
                  value={form.usageLimit}
                  onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                  placeholder="Leave empty for unlimited"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="coupon-starts">Starts on</Label>
                <Input
                  id="coupon-starts"
                  type="date"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupon-expires">Expires on</Label>
                <Input
                  id="coupon-expires"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-category">Category restriction (optional)</Label>
              <Select
                value={form.category || 'none'}
                onValueChange={(v) => setForm({ ...form, category: v === 'none' ? '' : v })}
              >
                <SelectTrigger id="coupon-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All categories</SelectItem>
                  <SelectItem value="men">Men only</SelectItem>
                  <SelectItem value="women">Women only</SelectItem>
                  <SelectItem value="accessories">Accessories only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="coupon-enabled" className="cursor-pointer">Enabled</Label>
                <p className="text-xs text-muted-foreground">
                  Disabled coupons fail validation at checkout.
                </p>
              </div>
              <Switch
                id="coupon-enabled"
                checked={form.enabled}
                onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Coupon'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This coupon stops working everywhere immediately. Orders that already used it
              keep their discount. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
