'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Edit,
  Loader2,
  ChevronRight,
  ChevronDown,
  CornerDownRight,
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
import {
  fetchCategoryTree,
  fetchCategoriesAdmin,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from '@/lib/actions/category.actions';
import type { CategoryNode } from '@/types';

interface FormState {
  id: string | null;
  name: string;
  slug: string;
  parentId: string;
  description: string;
  image: string;
  position: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  slug: '',
  parentId: '',
  description: '',
  image: '',
  position: '0',
};

/** Sentinel for "no parent" — Radix Select cannot hold an empty string value. */
const ROOT = '__root__';

function flatten(nodes: CategoryNode[], depth = 0): Array<CategoryNode & { depth: number }> {
  return nodes.flatMap((n) => [
    { ...n, depth },
    ...flatten(n.children, depth + 1),
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

export default function AdminCategoriesPage() {
  const { toast } = useToast();

  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CategoryNode | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<{
    productCount: number;
    descendantCount: number;
  } | null>(null);
  const [reassignTo, setReassignTo] = useState<string>('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextTree, flat] = await Promise.all([
        fetchCategoryTree(),
        fetchCategoriesAdmin(),
      ]);
      setTree(nextTree);
      setCounts(new Map(flat.map((c) => [c.id, Number(c.productCount) || 0])));
      // Roots start open; a two-level tree is the common shape.
      setExpanded(new Set(nextTree.map((n) => n.id)));
    } catch (e: any) {
      toast({
        title: 'Could not load categories',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const flatOptions = useMemo(() => flatten(tree), [tree]);

  const openCreate = (parentId?: string) => {
    setForm({ ...EMPTY_FORM, parentId: parentId ?? '' });
    setDialogOpen(true);
  };

  const openEdit = (node: CategoryNode) => {
    setForm({
      id: node.id,
      name: node.name,
      slug: node.slug,
      parentId: node.parentId ?? '',
      description: node.description ?? '',
      image: node.image ?? '',
      position: String(node.position ?? 0),
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        parentId: form.parentId || null,
        description: form.description,
        image: form.image.trim() || null,
        position: Number(form.position) || 0,
      };
      if (form.id) {
        await updateCategoryAction(form.id, payload);
        toast({ title: 'Category updated' });
      } else {
        await createCategoryAction(payload);
        toast({ title: 'Category created' });
      }
      setDialogOpen(false);
      await load();
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

  const askDelete = (node: CategoryNode) => {
    setDeleteTarget(node);
    setDeleteBlocked(null);
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
        // Products would be orphaned. Switch the dialog to a reassign picker
        // rather than failing outright.
        setDeleteBlocked({
          productCount: result.productCount,
          descendantCount: result.descendantCount,
        });
        return;
      }

      toast({
        title: 'Category deleted',
        description:
          result.reassignedProducts > 0
            ? `${result.reassignedProducts} product(s) reassigned.`
            : undefined,
      });
      setDeleteTarget(null);
      await load();
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

  const renderRows = (nodes: CategoryNode[], depth = 0): React.ReactNode[] =>
    nodes.flatMap((node) => {
      const isOpen = expanded.has(node.id);
      const count = counts.get(node.id) ?? 0;
      const rows: React.ReactNode[] = [
        <div
          key={node.id}
          className="flex items-center gap-2 border-b py-3 pr-2"
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
        >
          {node.children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
              className="text-muted-foreground hover:text-foreground"
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}

          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{node.name}</p>
            <p className="text-xs text-muted-foreground truncate">/{node.slug}</p>
          </div>

          <Badge variant="secondary" className="shrink-0">
            {count} product{count === 1 ? '' : 's'}
          </Badge>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => openCreate(node.id)}
            aria-label={`Add a category under ${node.name}`}
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
        </div>,
      ];
      if (isOpen && node.children.length > 0) {
        rows.push(...renderRows(node.children, depth + 1));
      }
      return rows;
    });

  // A category cannot become its own descendant's child.
  const parentChoices = form.id
    ? flatOptions.filter((o) => !subtreeIds(tree, form.id!).has(o.id))
    : flatOptions;

  const reassignChoices = deleteTarget
    ? flatOptions.filter((o) => !subtreeIds(tree, deleteTarget.id).has(o.id))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Categories</h1>
          <p className="text-sm text-muted-foreground">
            The storefront nav, homepage collections and shop filters all read this tree.
          </p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="h-4 w-4 mr-2" />
          Add category
        </Button>
      </div>

      <div className="border rounded-md">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : tree.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <p>No categories yet.</p>
            <Button variant="link" onClick={() => openCreate()}>
              Add the first one
            </Button>
          </div>
        ) : (
          <div>{renderRows(tree)}</div>
        )}
      </div>

      {/* Create / edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
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
              <Label htmlFor="cat-slug">Slug</Label>
              <Input
                id="cat-slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="Leave blank to derive from the name"
              />
              <p className="text-xs text-muted-foreground">
                Used in the URL: /shop/{form.slug || 'necklace-sets'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cat-parent">Parent</Label>
              <Select
                value={form.parentId || ROOT}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, parentId: v === ROOT ? '' : v }))
                }
              >
                <SelectTrigger id="cat-parent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT}>No parent (top level)</SelectItem>
                  {parentChoices.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {' '.repeat(opt.depth * 3)}
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
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cat-image">Image URL</Label>
                <Input
                  id="cat-image"
                  value={form.image}
                  onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                  placeholder="/api/media/…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-position">Position</Label>
                <Input
                  id="cat-position"
                  type="number"
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
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
          if (!open) {
            setDeleteTarget(null);
            setDeleteBlocked(null);
            setReassignTo('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {deleteBlocked ? (
                  <>
                    <p>
                      {deleteBlocked.productCount} product
                      {deleteBlocked.productCount === 1 ? '' : 's'} still
                      {deleteBlocked.descendantCount > 0
                        ? ` sit in this category or the ${deleteBlocked.descendantCount} below it`
                        : ' sit in this category'}
                      . Choose where they should go.
                    </p>
                    <Select value={reassignTo} onValueChange={setReassignTo}>
                      <SelectTrigger>
                        <SelectValue placeholder="Move products to…" />
                      </SelectTrigger>
                      <SelectContent>
                        {reassignChoices.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {' '.repeat(opt.depth * 3)}
                            {opt.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <p>
                    {(deleteTarget?.children.length ?? 0) > 0
                      ? `This also deletes the ${deleteTarget?.children.length} categories nested inside it. `
                      : ''}
                    This cannot be undone.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting || (!!deleteBlocked && !reassignTo)}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {deleteBlocked ? 'Reassign and delete' : 'Delete'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
