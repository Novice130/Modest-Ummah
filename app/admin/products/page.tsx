'use client';

import { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  exportProductsCsv,
  importProductsAction,
} from '@/lib/actions/product.actions';
import { parseCsv } from '@/lib/csv';
import { csvTemplate } from '@/lib/product-builder-schema';
import { getImageUrl, formatPrice, cn } from '@/lib/utils';
import type { Product } from '@/types';

interface ImportResult {
  row: number;
  ok: boolean;
  error?: string;
  name?: string;
}

const STATUS_COLORS: Record<string, string> = {
  published: 'bg-green-500 text-white',
  draft: 'bg-muted text-muted-foreground',
  pending: 'bg-gold-200 text-mocha-700',
  scheduled: 'bg-blue-500 text-white',
};

export default function AdminProductsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [importRows, setImportRows] = useState<string[][] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce the search input before hitting the server.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  useEffect(() => {
    loadProducts();
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProducts() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAllProductsAdmin(1, 200);
      const items = debouncedSearch
        ? result.items.filter(
            (p) =>
              p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
              p.sku.toLowerCase().includes(debouncedSearch.toLowerCase())
          )
        : result.items;
      setProducts(items);
    } catch (e: any) {
      setError(e?.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  async function handleDuplicate(id: string) {
    setDuplicating(id);
    try {
      const result = await duplicateProductAction(id);
      toast({
        title: 'Product duplicated',
        description: 'A draft copy was created.',
      });
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
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({
        title: 'Export failed',
        description: e?.message || 'Something went wrong.',
        variant: 'destructive',
      });
    }
  }

  function downloadTemplate() {
    const blob = new Blob(['\uFEFF' + csvTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setImportResults(null);
    setImportRows(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast({ title: 'Import failed', description: 'The file is empty.', variant: 'destructive' });
        return;
      }
      // Dry-run first: preview row-level errors before writing anything.
      const preview = await importProductsAction({ rows, dryRun: true });
      if (preview.results.some((r) => !r.ok)) {
        setImportResults(preview.results);
        setImportRows(rows);
        return;
      }
      const result = await importProductsAction({ rows, dryRun: false });
      toast({
        title: `Imported ${result.created} product${result.created === 1 ? '' : 's'}`,
        description: 'Rows with errors were skipped.',
      });
      loadProducts();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-3xl mb-2">My Products</h1>
          <p className="text-muted-foreground">{products.length} products found</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" /> Template
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export
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
              Add New Product
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center space-x-2 bg-background border rounded-md px-3 py-2 w-full max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
          placeholder="Search by name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search products"
        />
      </div>

      {importResults && (
        <div className="border rounded-lg p-4 bg-background">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Import preview</h2>
            <Button variant="ghost" size="sm" onClick={() => setImportResults(null)}>
              Dismiss
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            {importResults.filter((r) => r.ok).length} rows valid ·{' '}
            {importResults.filter((r) => !r.ok).length} rows with errors — nothing was
            imported yet.
          </p>
          <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
            {importResults.map((r) => (
              <div key={r.row} className="px-3 py-2 text-sm flex gap-2">
                <span className="text-muted-foreground w-12 shrink-0">Row {r.row}</span>
                {r.ok ? (
                  <span className="text-green-600">OK — {r.name}</span>
                ) : (
                  <span className="text-destructive">{r.error}</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              disabled={importing || !importRows}
              onClick={async () => {
                if (!importRows) return;
                setImporting(true);
                try {
                  const result = await importProductsAction({
                    rows: importRows,
                    dryRun: false,
                  });
                  toast({
                    title: `Imported ${result.created} product${result.created === 1 ? '' : 's'}`,
                    description:
                      result.results.filter((r) => !r.ok).length > 0
                        ? 'Rows with errors were skipped.'
                        : undefined,
                  });
                  setImportResults(null);
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
              }}
            >
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm import (skip bad rows)
            </Button>
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Image</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Status</TableHead>
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
            ) : error ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-destructive">
                  Error: {error}
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No products found. Start by adding one!
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
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
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="capitalize">{product.category}</TableCell>
                  <TableCell>{formatPrice(product.price)}</TableCell>
                  <TableCell>{product.stockQuantity || 0}</TableCell>
                  <TableCell>
                    <Badge className={cn(STATUS_COLORS[product.status] || 'bg-muted')}>
                      {product.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/product/${product.slug}`} target="_blank">
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/admin/products/${product.id}`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={duplicating === product.id}
                      onClick={() => handleDuplicate(product.id)}
                      aria-label={`Duplicate ${product.name}`}
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

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the product and its variants. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (!pendingDelete) return;
                setDeleting(pendingDelete.id);
                try {
                  await deleteProductAction(pendingDelete.id);
                  setProducts((prev) => prev.filter((p) => p.id !== pendingDelete.id));
                  toast({ title: 'Product deleted' });
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
    </div>
  );
}
