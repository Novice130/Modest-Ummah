'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, Edit, Loader2, Merge, Search, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useToast } from '@/hooks/use-toast';
import {
  fetchTagsWithCounts,
  createTagAction,
  updateTagAction,
  deleteTagAction,
  deleteTagsAction,
  mergeTagsAction,
} from '@/lib/actions/tag.actions';
import { slugify } from '@/lib/utils';

interface AdminTag {
  id: string;
  name: string;
  slug: string;
  position: number | null;
  productCount: number;
}

interface FormState {
  id: string | null;
  name: string;
  slug: string;
  position: string;
}

const EMPTY_FORM: FormState = { id: null, name: '', slug: '', position: '0' };

type SortKey = 'order' | 'name' | 'most' | 'least';

/** Mirrors the server's slug cleanup so the preview matches what is saved. */
function previewSlug(raw: string): string {
  return slugify(raw).replace(/_/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export default function AdminTagsPage() {
  const { toast } = useToast();

  const [tags, setTags] = useState<AdminTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('order');

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminTag | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [merging, setMerging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchTagsWithCounts();
      setTags(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          position: r.position,
          productCount: Number(r.productCount) || 0,
        }))
      );
      setSelected(new Set());
    } catch (e: any) {
      setLoadError(e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? tags.filter((t) => t.name.toLowerCase().includes(q) || t.slug.includes(q))
      : tags;
    if (sort === 'order') return filtered; // server order: sort order, then name
    const byName = (a: AdminTag, b: AdminTag) => a.name.localeCompare(b.name);
    return [...filtered].sort((a, b) => {
      if (sort === 'most') return b.productCount - a.productCount || byName(a, b);
      if (sort === 'least') return a.productCount - b.productCount || byName(a, b);
      return byName(a, b);
    });
  }, [tags, search, sort]);

  const selectedTags = useMemo(() => tags.filter((t) => selected.has(t.id)), [tags, selected]);
  const allVisibleSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((t) => next.delete(t.id));
      else visible.forEach((t) => next.add(t.id));
      return next;
    });

  const openMerge = () => {
    // Default to keeping the most-used tag: it is usually the canonical one.
    const keep = [...selectedTags].sort((a, b) => b.productCount - a.productCount)[0];
    setMergeTarget(keep?.id ?? '');
    setMergeOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await updateTagAction(form.id, {
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          position: Number(form.position) || 0,
        });
        toast({
          title: 'Tag updated',
          description: 'Every product carrying it follows automatically.',
        });
      } else {
        const row = await createTagAction({
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          position: Number(form.position) || 0,
        });
        if (row.created) {
          toast({ title: 'Tag created' });
        } else {
          toast({
            title: 'Tag already exists',
            description: `“${row.name}” (${row.slug}) is already in the list; nothing was added.`,
          });
        }
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

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { affectedProducts } = await deleteTagAction(deleteTarget.id);
      toast({
        title: 'Tag deleted',
        description:
          affectedProducts > 0
            ? `Removed from ${affectedProducts} product(s).`
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

  const confirmBulkDelete = async () => {
    setDeleting(true);
    try {
      const { deleted, affectedProducts } = await deleteTagsAction([...selected]);
      toast({
        title: `${plural(deleted, 'tag')} deleted`,
        description:
          affectedProducts > 0 ? `Removed from ${plural(affectedProducts, 'product')}.` : undefined,
      });
      setBulkDeleteOpen(false);
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

  const confirmMerge = async () => {
    if (!mergeTarget) return;
    setMerging(true);
    try {
      const sources = [...selected].filter((id) => id !== mergeTarget);
      const { movedProducts } = await mergeTagsAction(sources, mergeTarget);
      toast({
        title: 'Tags merged',
        description: `${plural(sources.length, 'tag')} folded in; ${plural(movedProducts, 'product')} now carry the kept tag.`,
      });
      setMergeOpen(false);
      setMergeTarget('');
      await load();
    } catch (e: any) {
      toast({
        title: 'Could not merge',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setMerging(false);
    }
  };

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl">Tags</h1>
          <p className="text-sm text-muted-foreground">
            {!loading && !loadError ? `${plural(tags.length, 'tag')}. ` : ''}
            Renaming a tag updates every product that carries it.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selected.size > 0 && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete ({selected.size})
            </Button>
          )}
          <Button
            variant="outline"
            disabled={selected.size < 2}
            onClick={openMerge}
            title={selected.size < 2 ? 'Select two or more tags to merge' : undefined}
          >
            <Merge className="h-4 w-4 mr-2" />
            Merge ({selected.size})
          </Button>
          <Button
            onClick={() => {
              setForm(EMPTY_FORM);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add tag
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tags"
            className="pl-9"
            aria-label="Search tags"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-48" aria-label="Sort tags">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="order">Storefront order</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="most">Most products</SelectItem>
            <SelectItem value="least">Fewest products (unused first)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : loadError ? (
          <div className="py-16 text-center space-y-2">
            <p className="flex items-center justify-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              Could not load tags: {loadError}
            </p>
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            {tags.length === 0 ? 'No tags yet.' : 'No tags match that search.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleAllVisible}
                    aria-label="Select all shown tags"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Products</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((tag) => (
                <TableRow key={tag.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(tag.id)}
                      onCheckedChange={() => toggleSelected(tag.id)}
                      aria-label={`Select ${tag.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{tag.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {tag.slug}
                  </TableCell>
                  <TableCell>
                    {tag.productCount > 0 ? (
                      <Badge variant="secondary">{tag.productCount}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unused</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${tag.name}`}
                      onClick={() => {
                        setForm({
                          id: tag.id,
                          name: tag.name,
                          slug: tag.slug,
                          position: String(tag.position ?? 0),
                        });
                        setDialogOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${tag.name}`}
                      onClick={() => setDeleteTarget(tag)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create / edit */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit tag' : 'New tag'}</DialogTitle>
            <DialogDescription>
              Tags are shared across products. Changing one here changes it everywhere.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tag-name">Name</Label>
              <Input
                id="tag-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Rose Gold"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-slug">Slug</Label>
              <Input
                id="tag-slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="Leave blank to derive from the name"
              />
              <p className="text-xs text-muted-foreground">
                Used in shop filter links: ?tag=
                {previewSlug(form.slug) || previewSlug(form.name) || 'rose-gold'}
                {form.id ? '. Changing it breaks existing filter links.' : ''}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-position">Sort order</Label>
              <Input
                id="tag-position"
                type="number"
                step="1"
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Lower numbers appear first in the shop tag filter. Equal numbers sort by name.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {form.id ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge */}
      <Dialog open={mergeOpen} onOpenChange={(open) => !merging && setMergeOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge {selected.size} tags</DialogTitle>
            <DialogDescription>
              Products carrying any of the selected tags gain the one you keep. The
              others are deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="merge-target">Keep</Label>
            <Select value={mergeTarget} onValueChange={setMergeTarget}>
              <SelectTrigger id="merge-target">
                <SelectValue placeholder="Choose the tag to keep" />
              </SelectTrigger>
              <SelectContent>
                {selectedTags.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({plural(t.productCount, 'product')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)} disabled={merging}>
              Cancel
            </Button>
            <Button onClick={confirmMerge} disabled={!mergeTarget || merging}>
              {merging && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.productCount > 0
                ? `It will be removed from ${plural(deleteTarget.productCount, 'product')}. The products themselves are not deleted. This cannot be undone.`
                : 'This tag is not used by any product.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete */}
      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => !open && !deleting && setBulkDeleteOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {plural(selected.size, 'tag')}?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const used = selectedTags.filter((t) => t.productCount > 0).length;
                return used > 0
                  ? `${plural(used, 'selected tag')} ${used === 1 ? 'is' : 'are'} still on products and will be removed from them. The products themselves are not deleted. This cannot be undone.`
                  : 'None of the selected tags are used by a product. This cannot be undone.';
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmBulkDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
