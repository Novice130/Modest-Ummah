'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus,
  Trash2,
  Edit,
  Loader2,
  ChevronRight,
  ChevronDown,
  CornerDownRight,
  ArrowUp,
  ArrowDown,
  Search,
  Upload,
  X,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { useToast } from '@/hooks/use-toast';
import { slugify } from '@/lib/utils';
import {
  fetchCategoriesAdmin,
  fetchCategoryDeleteImpact,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  reorderCategoriesAction,
  type CategoryDeleteImpact,
} from '@/lib/actions/category.actions';
import type { CategoryNode } from '@/types';

interface FormState {
  id: string | null;
  name: string;
  slug: string;
  /** Slug the category had when the dialog opened; '' when creating. */
  originalSlug: string;
  parentId: string;
  description: string;
  image: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  slug: '',
  originalSlug: '',
  parentId: '',
  description: '',
  image: '',
};

/** Sentinel for "no parent" — Radix Select cannot hold an empty string value. */
const ROOT = '__root__';

type AdminNode = CategoryNode & { productCount: number; totalProducts: number };

/** Mirrors the server's slug cleanup so the URL preview matches what is saved. */
function previewSlug(raw: string): string {
  return slugify(raw).replace(/_/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Builds the tree from the uncached admin list. Rows arrive ordered by
 * position then name, so children keep that order. Each node carries its
 * direct product count and the total for its whole subtree — a parent with
 * nothing attached directly still shows what the storefront shows under it.
 */
function buildTree(
  rows: Awaited<ReturnType<typeof fetchCategoriesAdmin>>
): AdminNode[] {
  const nodes = new Map<string, AdminNode>();
  for (const r of rows) {
    const direct = Number(r.productCount) || 0;
    nodes.set(r.id, {
      id: r.id,
      name: r.name,
      slug: r.slug,
      parentId: r.parentId,
      description: r.description ?? '',
      image: r.image,
      position: r.position ?? 0,
      children: [],
      productCount: direct,
      totalProducts: direct,
    });
  }
  const roots: AdminNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sum = (n: AdminNode): number => {
    n.totalProducts =
      n.productCount + (n.children as AdminNode[]).reduce((acc, c) => acc + sum(c), 0);
    return n.totalProducts;
  };
  roots.forEach(sum);
  return roots;
}

function flatten(
  nodes: AdminNode[],
  depth = 0,
  path: string[] = []
): Array<AdminNode & { depth: number; path: string[] }> {
  return nodes.flatMap((n) => [
    { ...n, depth, path },
    ...flatten(n.children as AdminNode[], depth + 1, [...path, n.name]),
  ]);
}

/** Ids that cannot be a parent of `id`: itself and everything beneath it. */
function subtreeIds(nodes: CategoryNode[], id: string): Set<string> {
  const out = new Set<string>();
  const walk = (n: CategoryNode) => {
    out.add(n.id);
    n.children.forEach(walk);
  };
  const find = (list: CategoryNode[]): CategoryNode | null => {
    for (const n of list) {
      if (n.id === id) return n;
      const hit = find(n.children);
      if (hit) return hit;
    }
    return null;
  };
  const node = find(nodes);
  if (node) walk(node);
  return out;
}

function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

export default function AdminCategoriesPage() {
  const { toast } = useToast();

  const [tree, setTree] = useState<AdminNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [reordering, setReordering] = useState(false);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<AdminNode | null>(null);
  const [impact, setImpact] = useState<CategoryDeleteImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [reassignTo, setReassignTo] = useState<string>('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(
    async (opts: { keepExpanded?: boolean } = {}) => {
      setLoading(true);
      setLoadError(null);
      try {
        const nextTree = buildTree(await fetchCategoriesAdmin());
        setTree(nextTree);
        // Roots start open; a two-level tree is the common shape. Reloads
        // after an edit keep whatever the admin had opened.
        if (!opts.keepExpanded) setExpanded(new Set(nextTree.map((n) => n.id)));
      } catch (e: any) {
        setLoadError(e?.message || 'Something went wrong.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const flatOptions = useMemo(() => flatten(tree), [tree]);
  const totalCategories = flatOptions.length;

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return flatOptions.filter(
      (o) => o.name.toLowerCase().includes(q) || o.slug.includes(q)
    );
  }, [flatOptions, search]);

  const openCreate = (parentId?: string) => {
    setForm({ ...EMPTY_FORM, parentId: parentId ?? '' });
    setDialogOpen(true);
  };

  const openEdit = (node: CategoryNode) => {
    setForm({
      id: node.id,
      name: node.name,
      slug: node.slug,
      originalSlug: node.slug,
      parentId: node.parentId ?? '',
      description: node.description ?? '',
      image: node.image ?? '',
    });
    setDialogOpen(true);
  };

  const uploadImage = async (file: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Image not accepted',
        description: 'Allowed: jpg, png, webp, avif up to 5 MB.',
        variant: 'destructive',
      });
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('files', file);
      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.urls?.[0]) throw new Error(data?.error || 'Upload failed');
      setForm((f) => ({ ...f, image: data.urls[0] }));
    } catch (e: any) {
      toast({
        title: 'Upload failed',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const slugInput = form.slug.trim();
      if (form.id) {
        await updateCategoryAction(form.id, {
          name: form.name.trim(),
          // Unchanged slug is not re-sent, so an edit never moves the URL.
          slug: slugInput && slugInput !== form.originalSlug ? slugInput : undefined,
          parentId: form.parentId || null,
          description: form.description,
          image: form.image.trim() || null,
        });
        toast({ title: 'Category updated' });
      } else {
        const row = await createCategoryAction({
          name: form.name.trim(),
          slug: slugInput || undefined,
          parentId: form.parentId || null,
          description: form.description,
          image: form.image.trim() || null,
        });
        toast({ title: 'Category created', description: `/shop/${row.slug}` });
        if (form.parentId) {
          setExpanded((prev) => new Set(prev).add(form.parentId));
        }
      }
      setDialogOpen(false);
      await load({ keepExpanded: true });
    } catch (e: any) {
      toast({
        title: 'Could not save',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Moves a node one step among its siblings. Siblings are renumbered
   * 0..n-1 so ties left by older data (everything at 0) stop depending on
   * alphabetical order.
   */
  const move = async (node: AdminNode, siblings: AdminNode[], dir: -1 | 1) => {
    const index = siblings.findIndex((s) => s.id === node.id);
    const swapWith = index + dir;
    if (index < 0 || swapWith < 0 || swapWith >= siblings.length) return;
    const ordered = [...siblings];
    [ordered[index], ordered[swapWith]] = [ordered[swapWith], ordered[index]];
    setReordering(true);
    try {
      await reorderCategoriesAction(ordered.map((s, i) => ({ id: s.id, position: i })));
      await load({ keepExpanded: true });
    } catch (e: any) {
      toast({
        title: 'Could not reorder',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setReordering(false);
    }
  };

  const askDelete = async (node: AdminNode) => {
    setDeleteTarget(node);
    setImpact(null);
    setReassignTo('');
    setImpactLoading(true);
    try {
      setImpact(await fetchCategoryDeleteImpact(node.id));
    } catch (e: any) {
      toast({
        title: 'Could not check this category',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      });
      setDeleteTarget(null);
    } finally {
      setImpactLoading(false);
    }
  };

  const closeDelete = () => {
    setDeleteTarget(null);
    setImpact(null);
    setReassignTo('');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteCategoryAction(deleteTarget.id, {
        reassignTo: reassignTo || undefined,
      });

      if (!result.deleted) {
        // Products were added since the dialog opened. Show the fresh
        // numbers and the reassign picker rather than failing outright.
        setImpact({
          productCount: result.productCount,
          descendantCount: result.descendantCount,
          couponCount: result.couponCount,
        });
        return;
      }

      const notes = [
        result.removedCategories > 1 &&
          `${plural(result.removedCategories - 1, 'subcategory', 'subcategories')} removed`,
        result.reassignedProducts > 0 && `${plural(result.reassignedProducts, 'product')} moved`,
        result.disabledCoupons > 0 && `${plural(result.disabledCoupons, 'coupon')} disabled`,
      ].filter(Boolean);
      toast({
        title: 'Category deleted',
        description: notes.length ? `${notes.join(', ')}.` : undefined,
      });
      closeDelete();
      await load({ keepExpanded: true });
    } catch (e: any) {
      toast({
        title: 'Could not delete',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderRow = (
    node: AdminNode,
    depth: number,
    opts: { siblings?: AdminNode[]; path?: string[] } = {}
  ) => {
    const isOpen = expanded.has(node.id);
    const children = node.children as AdminNode[];
    const index = opts.siblings?.findIndex((s) => s.id === node.id) ?? -1;
    return (
      <div
        key={node.id}
        className="flex items-center gap-2 border-b last:border-b-0 py-3 pr-2"
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        {!opts.path && children.length > 0 ? (
          <button
            type="button"
            onClick={() => toggle(node.id)}
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className="text-muted-foreground hover:text-foreground"
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {node.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={node.image}
            alt=""
            className="h-9 w-9 rounded object-cover border shrink-0"
          />
        ) : (
          <span className="h-9 w-9 rounded border bg-muted shrink-0" aria-hidden />
        )}

        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{node.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {opts.path && opts.path.length > 0 ? `${opts.path.join(' › ')} · ` : ''}
            /shop/{node.slug}
          </p>
        </div>

        <div className="text-right shrink-0">
          <Badge variant="secondary">{plural(node.totalProducts, 'product')}</Badge>
          {children.length > 0 && node.productCount !== node.totalProducts && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {node.productCount} directly
            </p>
          )}
        </div>

        {opts.siblings && (
          <div className="flex flex-col">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              disabled={reordering || index <= 0}
              onClick={() => move(node, opts.siblings!, -1)}
              aria-label={`Move ${node.name} up`}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              disabled={reordering || index < 0 || index >= opts.siblings.length - 1}
              onClick={() => move(node, opts.siblings!, 1)}
              aria-label={`Move ${node.name} down`}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => openCreate(node.id)}
          aria-label={`Add a category under ${node.name}`}
          title="Add subcategory"
        >
          <CornerDownRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => openEdit(node)}
          aria-label={`Edit ${node.name}`}
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => askDelete(node)}
          aria-label={`Delete ${node.name}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    );
  };

  const renderRows = (nodes: AdminNode[], depth = 0): React.ReactNode[] =>
    nodes.flatMap((node) => {
      const rows: React.ReactNode[] = [renderRow(node, depth, { siblings: nodes })];
      const children = node.children as AdminNode[];
      if (expanded.has(node.id) && children.length > 0) {
        rows.push(...renderRows(children, depth + 1));
      }
      return rows;
    });

  // A category cannot become its own (or its descendant's) child.
  const parentChoices = form.id
    ? flatOptions.filter((o) => !subtreeIds(tree, form.id!).has(o.id))
    : flatOptions;

  const reassignChoices = deleteTarget
    ? flatOptions.filter((o) => !subtreeIds(tree, deleteTarget.id).has(o.id))
    : [];

  const slugPreview = previewSlug(form.slug) || previewSlug(form.name) || 'category';
  const slugChanged = !!form.id && !!form.slug.trim() && previewSlug(form.slug) !== form.originalSlug;
  const needsReassign = !!impact && impact.productCount > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl">Categories</h1>
          <p className="text-sm text-muted-foreground">
            {loading && tree.length === 0
              ? 'The storefront nav, homepage collections and shop filters all read this tree.'
              : `${plural(totalCategories, 'category', 'categories')}. The storefront nav, homepage collections and shop filters all read this tree.`}
          </p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="h-4 w-4 mr-2" />
          Add category
        </Button>
      </div>

      {tree.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories"
            className="pl-9"
            aria-label="Search categories"
          />
        </div>
      )}

      <div className="border rounded-md">
        {loading && tree.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : loadError ? (
          <div className="py-16 text-center space-y-2">
            <p className="flex items-center justify-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              Could not load categories: {loadError}
            </p>
            <Button variant="outline" size="sm" onClick={() => load()}>
              Retry
            </Button>
          </div>
        ) : tree.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <p>No categories yet.</p>
            <Button variant="link" onClick={() => openCreate()}>
              Add the first one
            </Button>
          </div>
        ) : searchResults ? (
          searchResults.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              No categories match that search.
            </div>
          ) : (
            <div>{searchResults.map((n) => renderRow(n, 0, { path: n.path }))}</div>
          )
        ) : (
          <div className={reordering ? 'opacity-60 pointer-events-none' : undefined}>
            {renderRows(tree)}
          </div>
        )}
      </div>
      {!searchResults && tree.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Use the arrows to set the order categories appear in the storefront nav and on the
          homepage.
        </p>
      )}

      {/* Create / edit */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit category' : 'New category'}</DialogTitle>
            <DialogDescription>
              Products attach to the deepest level. A parent shows everything beneath it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Necklace Sets"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cat-slug">URL handle</Label>
              <Input
                id="cat-slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder={form.id ? form.originalSlug : 'Leave blank to derive from the name'}
              />
              <p className="text-xs text-muted-foreground">
                /shop/{form.id && !form.slug.trim() ? form.originalSlug : slugPreview}
                {!form.id && !form.slug.trim() && ' (a number is added if this is taken)'}
              </p>
              {slugChanged && (
                <p className="text-xs text-amber-600">
                  Changing the handle changes the page URL. Links to /shop/{form.originalSlug}{' '}
                  will stop working.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cat-parent">Parent</Label>
              <Select
                value={form.parentId || ROOT}
                onValueChange={(v) => setForm((f) => ({ ...f, parentId: v === ROOT ? '' : v }))}
              >
                <SelectTrigger id="cat-parent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT}>No parent (top level)</SelectItem>
                  {parentChoices.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {' '.repeat(opt.depth * 3)}
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cat-description">Description</Label>
              <Textarea
                id="cat-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Shown under the heading on the category page and on its homepage tile, and used as
                the search-engine description.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cat-image">Image</Label>
              <div className="flex items-start gap-3">
                {form.image ? (
                  <div className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.image}
                      alt=""
                      className="h-20 w-20 rounded object-cover border"
                    />
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, image: '' }))}
                      className="absolute -top-2 -right-2 rounded-full bg-background border p-0.5"
                      aria-label="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-20 w-20 rounded border border-dashed bg-muted shrink-0" />
                )}
                <div className="flex-1 space-y-2">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadImage(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileInput.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Upload
                  </Button>
                  <Input
                    id="cat-image"
                    value={form.image}
                    onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                    placeholder="or paste an image URL"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Top-level categories use this as their homepage collection tile.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || uploading}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {form.id ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) closeDelete();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {impactLoading || !impact ? (
                  <p className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking what this affects…
                  </p>
                ) : (
                  <>
                    <ul className="list-disc pl-5 space-y-1">
                      {impact.descendantCount > 0 && (
                        <li>
                          Its{' '}
                          {impact.descendantCount === 1
                            ? 'subcategory'
                            : `${impact.descendantCount} subcategories`}{' '}
                          will be deleted too.
                        </li>
                      )}
                      {impact.productCount > 0 && (
                        <li>
                          {plural(impact.productCount, 'product')}{' '}
                          {impact.descendantCount > 0 ? 'in it or below it' : 'in it'} must move
                          to another category. Products are never deleted.
                        </li>
                      )}
                      {impact.couponCount > 0 && (
                        <li>
                          {plural(impact.couponCount, 'coupon')} limited to this category will be
                          disabled, so they do not turn into storewide discounts.
                        </li>
                      )}
                      <li>This cannot be undone.</li>
                    </ul>
                    {needsReassign && (
                      <Select value={reassignTo} onValueChange={setReassignTo}>
                        <SelectTrigger aria-label="Move products to">
                          <SelectValue placeholder="Move products to…" />
                        </SelectTrigger>
                        <SelectContent>
                          {reassignChoices.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {' '.repeat(opt.depth * 3)}
                              {opt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting || impactLoading || !impact || (needsReassign && !reassignTo)}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {needsReassign ? 'Move products and delete' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
