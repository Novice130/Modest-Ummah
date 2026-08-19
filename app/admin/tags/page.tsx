'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, Edit, Loader2, Merge, Search } from 'lucide-react';
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
  mergeTagsAction,
} from '@/lib/actions/tag.actions';

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

export default function AdminTagsPage() {
  const { toast } = useToast();

  const [tags, setTags] = useState<AdminTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminTag | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [merging, setMerging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
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
      toast({
        title: 'Could not load tags',
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter(
      (t) => t.name.toLowerCase().includes(q) || t.slug.includes(q)
    );
  }, [tags, search]);

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
        await createTagAction({
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
        });
        toast({ title: 'Tag created' });
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

  const confirmMerge = async () => {
    if (!mergeTarget) return;
    setMerging(true);
    try {
      const sources = [...selected].filter((id) => id !== mergeTarget);
      const { movedProducts } = await mergeTagsAction(sources, mergeTarget);
      toast({
        title: 'Tags merged',
        description: `${sources.length} tag(s) folded in, ${movedProducts} product(s) updated.`,
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Tags</h1>
          <p className="text-sm text-muted-foreground">
            Renaming a tag updates every product that carries it.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={selected.size < 2}
            onClick={() => setMergeOpen(true)}
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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags"
          className="pl-9"
        />
      </div>

      <div className="border rounded-md">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            {tags.length === 0 ? 'No tags yet.' : 'No tags match that search.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
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
                    <Badge variant="secondary">{tag.productCount}</Badge>
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
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
            </div>
            {form.id && (
              <div className="space-y-2">
                <Label htmlFor="tag-position">Position</Label>
                <Input
                  id="tag-position"
                  type="number"
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                />
              </div>
            )}
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

      {/* Merge */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge {selected.size} tags</DialogTitle>
            <DialogDescription>
              Products carrying any of the selected tags gain the one you keep. The
              others are deleted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="merge-target">Keep</Label>
            <Select value={mergeTarget} onValueChange={setMergeTarget}>
              <SelectTrigger id="merge-target">
                <SelectValue placeholder="Choose the tag to keep" />
              </SelectTrigger>
              <SelectContent>
                {tags
                  .filter((t) => selected.has(t.id))
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>
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
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.productCount > 0
                ? `It will be removed from ${deleteTarget.productCount} product(s). The products themselves are not deleted.`
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
    </div>
  );
}
