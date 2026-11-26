'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Trash2,
  Edit,
  Loader2,
  Eye,
  Copy,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  Star,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  fetchAllProductsAdmin,
  deleteProductAction,
  duplicateProductAction,
  bulkUpdateProductsAction,
  exportProductsCsv,
  importProductsAction,
  type AdminProductRow,
  type AdminProductSort,
  type AdminStockFilter,
} from '@/lib/actions/product.actions';
import { fetchCategoryTree } from '@/lib/actions/category.actions';
import { parseCsv } from '@/lib/csv';
import { csvTemplate } from '@/lib/product-builder-schema';
import { getImageUrl, formatPrice, cn } from '@/lib/utils';
import type { CategoryNode } from '@/types';

interface ImportResult {
  row: number;
  ok: boolean;
  error?: string;
  name?: string;
}

const STATUS_STYLES: Record<string, string> = {
  published: 'bg-green-600 text-white',
  draft: 'bg-muted text-muted-foreground',
  pending: 'bg-gold-200 text-mocha-700',
  scheduled: 'bg-blue-600 text-white',
};

const STATUS_LABELS: Record<string, string> = {
  published: 'Published',
  draft: 'Draft',
  pending: 'Pending review',
  scheduled: 'Scheduled',
};

const SORTS: Array<{ value: AdminProductSort; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'updated', label: 'Recently edited' },
  { value: 'name', label: 'Name A–Z' },
  { value: '-name', label: 'Name Z–A' },
  { value: 'price', label: 'Price low–high' },
  { value: '-price', label: 'Price high–low' },
  { value: 'stock', label: 'Stock low–high' },
  { value: '-stock', label: 'Stock high–low' },
];

const PAGE_SIZE = 25;

type BulkAction = 'publish' | 'draft' | 'feature' | 'unfeature' | 'delete';

function flattenCategories(nodes: CategoryNode[], depth = 0): Array<{ id: string; label: string }> {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${' '.repeat(depth * 3)}${n.name}` },
    ...flattenCategories(n.children, depth + 1),
  ]);
}

function downloadText(text: string, filename: string) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Stock cell: what a shopper would actually see, plus the count. */
function StockCell({ product }: { product: AdminProductRow }) {
  const qty = product.stockQuantity || 0;
  const perVariant = product.variantCount > 0 ? ` · ${product.variantCount} variants` : '';
  if (!product.manageStock) {
    return (
      <span className={product.inStock ? 'text-foreground' : 'text-destructive'}>
        {product.inStock ? 'In stock' : 'Out of stock'}
        <span className="block text-xs text-muted-foreground">Not tracked{perVariant}</span>
      </span>
    );
  }
  if (!product.inStock) {
    return (
      <span className="text-destructive font-medium">
        Out of stock<span className="block text-xs font-normal text-muted-foreground">0{perVariant}</span>
      </span>
    );
  }
  if (qty <= 0) {
    return (
      <span className="text-amber-700 dark:text-amber-400">
        On backorder<span className="block text-xs text-muted-foreground">0{perVariant}</span>
      </span>
    );
  }
  const low = qty <= (product.lowStockThreshold ?? 5);
  return (
    <span className={low ? 'text-amber-700 dark:text-amber-400 font-medium' : undefined}>
      {qty} in stock
      <span className="block text-xs font-normal text-muted-foreground">
        {low ? 'Low stock' : ''}
        {low && perVariant ? ' · ' : ''}
        {perVariant.replace(/^ · /, '')}
      </span>
    </span>
  );
}

function PriceCell({ product }: { product: AdminProductRow }) {
  if (product.variantCount > 0 && product.priceMin !== product.priceMax) {
    return (
      <span>
        {formatPrice(product.priceMin)} – {formatPrice(product.priceMax)}
      </span>
    );
  }
  return (
    <span>
      {formatPrice(product.priceMin)}
      {product.compareAtPrice && product.compareAtPrice > product.price && (
        <span className="block text-xs text-muted-foreground line-through">
          {formatPrice(product.compareAtPrice)}
        </span>
      )}
    </span>
  );
}

function isLive(product: AdminProductRow) {
  return (
    product.status === 'published' ||
    (product.status === 'scheduled' && !!product.publishedAt && new Date(product.publishedAt) <= new Date())
  );
}

export default function AdminProductsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | AdminStockFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sort, setSort] = useState<AdminProductSort>('newest');
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminProductRow | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [importRows, setImportRows] = useState<string[][] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtersActive =
    debouncedSearch.trim() !== '' || statusFilter !== 'all' || stockFilter !== 'all' || categoryFilter !== 'all';

  // Debounce the search input before hitting the server.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchCategoryTree()
      .then((tree) => setCategoryOptions(flattenCategories(tree)))
      .catch(() => {});
  }, []);

  // A selection only makes sense for the rows on screen.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, debouncedSearch, statusFilter, stockFilter, categoryFilter, sort]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAllProductsAdmin(page, PAGE_SIZE, {
        search: debouncedSearch,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        stock: stockFilter !== 'all' ? stockFilter : undefined,
        categoryId: categoryFilter !== 'all' ? categoryFilter : undefined,
        sort,
      });
      // Deleting the last row of the last page leaves an empty page behind.
      if (result.items.length === 0 && page > 1 && result.totalItems > 0) {
        setPage(Math.max(1, result.totalPages));
        return;
      }
      setProducts(result.items);
      setTotalItems(result.totalItems);
      setTotalPages(Math.max(1, result.totalPages));
    } catch (e: any) {
      setError(e?.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, stockFilter, categoryFilter, sort]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const resetFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setStatusFilter('all');
    setStockFilter('all');
    setCategoryFilter('all');
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = products.length > 0 && products.every((p) => selectedIds.has(p.id));
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(products.map((p) => p.id)));
  };

  async function handleBulk(action: BulkAction) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const result = await bulkUpdateProductsAction({ ids: Array.from(selectedIds), action });
      const noun = (n: number) => `${n} product${n === 1 ? '' : 's'}`;
      toast({
        title:
          action === 'delete'
            ? `Deleted ${noun(result.updated)}`
            : action === 'publish'
              ? `Published ${noun(result.updated)}`
              : `Updated ${noun(result.updated)}`,
        description:
          action === 'publish' && result.skipped > 0
            ? `${noun(result.skipped)} could not be published: each needs a price above $0 and a category. Open them to fix.`
            : undefined,
        variant: action === 'publish' && result.skipped > 0 ? 'destructive' : undefined,
      });
      setSelectedIds(new Set());
      loadProducts();
    } catch (e: any) {
      toast({
        title: 'Bulk update failed',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleDuplicate(id: string) {
    setDuplicating(id);
    try {
      const result = await duplicateProductAction(id);
      toast({ title: 'Product duplicated', description: 'Opened the draft copy.' });
      router.push(`/admin/products/${result.id}`);
    } catch (e: any) {
      toast({
        title: 'Failed to duplicate',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setDuplicating(null);
    }
  }

  async function handleExport() {
    try {
      const csv = await exportProductsCsv();
      downloadText(csv, `products-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e: any) {
      toast({
        title: 'Export failed',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setImportResults(null);
    setImportRows(null);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) {
        toast({ title: 'Import failed', description: 'The file has no product rows.', variant: 'destructive' });
        return;
      }
      // Always a dry-run first: nothing is written until the admin confirms.
      const preview = await importProductsAction({ rows, dryRun: true });
      setImportResults(preview.results);
      setImportRows(rows);
    } catch (e: any) {
      toast({
        title: 'Import failed',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function confirmImport() {
    if (!importRows) return;
    setImporting(true);
    try {
      const result = await importProductsAction({ rows: importRows, dryRun: false });
      const failed = result.results.filter((r) => !r.ok).length;
      toast({
        title: `Imported ${result.created} product${result.created === 1 ? '' : 's'} as listed in the file`,
        description: failed > 0 ? `${failed} product(s) with errors were skipped.` : undefined,
      });
      setImportResults(failed > 0 ? result.results.filter((r) => !r.ok) : null);
      setImportRows(null);
      loadProducts();
    } catch (e: any) {
      toast({
        title: 'Import failed',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  }

  const validImports = importResults?.filter((r) => r.ok).length ?? 0;
  const invalidImports = importResults?.filter((r) => !r.ok).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-3xl mb-2">Products</h1>
          <p className="text-muted-foreground">
            {loading && products.length === 0
              ? 'Loading…'
              : `${totalItems} product${totalItems === 1 ? '' : 's'}${filtersActive ? ' match the filters' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => downloadText(csvTemplate(), 'product-import-template.csv')}>
            <Download className="mr-2 h-4 w-4" /> CSV template
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export all
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
            }}
          />
          <Button asChild>
            <Link href="/admin/products/new">
              <Plus className="mr-2 h-4 w-4" />
              Add product
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center space-x-2 bg-background border rounded-md px-3 py-2 w-full max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
            placeholder="Search name, SKU or variant SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search products"
          />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => setSearch('')}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending">Pending review</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={stockFilter}
          onValueChange={(v) => { setStockFilter(v as 'all' | AdminStockFilter); setPage(1); }}
        >
          <SelectTrigger className="w-[140px]" aria-label="Filter by stock">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock</SelectItem>
            <SelectItem value="in">In stock</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]" aria-label="Filter by category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categoryOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => { setSort(v as AdminProductSort); setPage(1); }}>
          <SelectTrigger className="w-[170px]" aria-label="Sort products">
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
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button size="sm" disabled={bulkBusy} onClick={() => handleBulk('publish')}>
            Publish
          </Button>
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => handleBulk('draft')}>
            Move to draft
          </Button>
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => handleBulk('feature')}>
            <Star className="mr-1 h-3 w-3" /> Feature
          </Button>
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => handleBulk('unfeature')}>
            Unfeature
          </Button>
          <Button size="sm" variant="destructive" disabled={bulkBusy} onClick={() => setConfirmBulkDelete(true)}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </Button>
          {bulkBusy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      )}

      {importResults && (
        <div className="border rounded-lg p-4 bg-background">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">{importRows ? 'Import preview' : 'Import errors'}</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setImportResults(null);
                setImportRows(null);
              }}
            >
              Dismiss
            </Button>
          </div>
          {importRows && (
            <p className="text-sm text-muted-foreground mb-2">
              {validImports} product{validImports === 1 ? '' : 's'} ready
              {invalidImports > 0 && ` · ${invalidImports} with errors (they will be skipped)`} — nothing
              has been imported yet. Variable products are counted once, however many variant rows they have.
            </p>
          )}
          <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
            {importResults.map((r) => (
              <div key={r.row} className="px-3 py-2 text-sm flex gap-2">
                <span className="text-muted-foreground w-16 shrink-0">Row {r.row}</span>
                {r.ok ? (
                  <span className="text-green-600">OK — {r.name}</span>
                ) : (
                  <span className="text-destructive">{r.error}</span>
                )}
              </div>
            ))}
          </div>
          {importRows && (
            <div className="flex gap-2 mt-3">
              <Button size="sm" disabled={importing || validImports === 0} onClick={confirmImport}>
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {validImports} product{validImports === 1 ? '' : 's'}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="border rounded-lg overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all products on this page"
                />
              </TableHead>
              <TableHead className="w-[64px]">Image</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <p className="text-destructive mb-2">Could not load products: {error}</p>
                  <Button variant="outline" size="sm" onClick={loadProducts}>
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {filtersActive ? (
                    <>
                      No products match these filters.{' '}
                      <button type="button" className="underline" onClick={resetFilters}>
                        Clear filters
                      </button>
                    </>
                  ) : (
                    <>
                      No products yet.{' '}
                      <Link href="/admin/products/new" className="underline">
                        Add your first product
                      </Link>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow
                  key={product.id}
                  data-state={selectedIds.has(product.id) ? 'selected' : undefined}
                  className={cn(loading && 'opacity-60')}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(product.id)}
                      onCheckedChange={() => toggleSelect(product.id)}
                      aria-label={`Select ${product.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="relative w-10 h-10 rounded-md overflow-hidden bg-muted">
                      {product.images?.[0] && (
                        <Image
                          src={getImageUrl(product.images[0])}
                          alt={product.name}
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/products/${product.id}`} className="font-medium hover:underline">
                      {product.name}
                    </Link>
                    {product.featured && (
                      <Star
                        className="inline ml-1.5 h-3.5 w-3.5 fill-gold-200 text-gold-200 align-[-2px]"
                        aria-label="Featured"
                      />
                    )}
                    <span className="block text-xs text-muted-foreground">
                      {product.sku || 'No SKU'}
                      {product.productType === 'variable' && ' · Variable'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {product.category ? (
                      product.category.path.map((c) => c.name).join(' › ')
                    ) : (
                      <span className="text-destructive text-sm">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <PriceCell product={product} />
                  </TableCell>
                  <TableCell>
                    <StockCell product={product} />
                  </TableCell>
                  <TableCell>
                    <Badge className={cn(STATUS_STYLES[product.status] || 'bg-muted')}>
                      {STATUS_LABELS[product.status] ?? product.status}
                    </Badge>
                    {product.status === 'scheduled' && product.publishedAt && (
                      <span className="block text-xs text-muted-foreground mt-1">
                        {new Date(product.publishedAt).toLocaleString()}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1 whitespace-nowrap">
                    {isLive(product) ? (
                      <Button variant="ghost" size="icon" asChild>
                        <Link
                          href={`/product/${product.slug}`}
                          target="_blank"
                          aria-label={`View ${product.name} on the store`}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled
                        title="Not on the store until published"
                        aria-label="Not on the store until published"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/admin/products/${product.id}`} aria-label={`Edit ${product.name}`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={duplicating === product.id}
                      onClick={() => handleDuplicate(product.id)}
                      aria-label={`Duplicate ${product.name}`}
                      title="Duplicate as a draft"
                    >
                      {duplicating === product.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={deleting === product.id}
                      onClick={() => setPendingDelete(product)}
                      aria-label={`Delete ${product.name}`}
                    >
                      {deleting === product.id ? (
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

      {/* Pagination */}
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

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the product, its variants and options. Past orders keep
              their line items. This cannot be undone — to just hide it, move it to Draft instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (!pendingDelete) return;
                const target = pendingDelete;
                setDeleting(target.id);
                try {
                  const ok = await deleteProductAction(target.id);
                  toast({ title: ok ? 'Product deleted' : 'Product was already deleted' });
                  loadProducts();
                } catch (e: any) {
                  toast({
                    title: 'Failed to delete',
                    description: e?.message || 'Something went wrong.',
                    variant: 'destructive',
                  });
                } finally {
                  setDeleting(null);
                  setPendingDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} product{selectedIds.size === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the selected products with their variants and options.
              It cannot be undone — to just hide them, use “Move to draft”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                setConfirmBulkDelete(false);
                handleBulk('delete');
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
