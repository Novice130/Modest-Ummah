'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchCategoryTree } from '@/lib/actions/category.actions';
import { createTagAction, fetchTags } from '@/lib/actions/tag.actions';
import { useToast } from '@/hooks/use-toast';
import { Field } from '../field';
import type { useProductBuilder } from '../use-product-builder';
import type { CategoryNode, TagRef } from '@/types';

type Builder = ReturnType<typeof useProductBuilder>;

/**
 * Flattens the tree into Select options. Parents render as disabled headers
 * and leaves as selectable rows — products attach to leaves, because the
 * ancestor chain is what produces the breadcrumb.
 */
function flattenForSelect(
  nodes: CategoryNode[],
  depth = 0
): Array<{ id: string; label: string; depth: number; selectable: boolean }> {
  const out: Array<{ id: string; label: string; depth: number; selectable: boolean }> = [];
  for (const node of nodes) {
    out.push({
      id: node.id,
      label: node.name,
      depth,
      selectable: node.children.length === 0,
    });
    if (node.children.length > 0) out.push(...flattenForSelect(node.children, depth + 1));
  }
  return out;
}

export default function OrganizationSection({ builder }: { builder: Builder }) {
  const { doc, update, errors } = builder;
  const { toast } = useToast();

  const [tagInput, setTagInput] = useState('');
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [allTags, setAllTags] = useState<TagRef[]>([]);
  const [creatingTag, setCreatingTag] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tree, tags] = await Promise.all([fetchCategoryTree(), fetchTags()]);
        if (cancelled) return;
        setCategoryTree(tree);
        setAllTags(tags);
      } catch {
        if (!cancelled) {
          toast({
            title: 'Could not load categories and tags',
            description: 'Reload the page to try again.',
            variant: 'destructive',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const categoryOptions = useMemo(() => flattenForSelect(categoryTree), [categoryTree]);
  const tagsById = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags]);

  /**
   * Creates the tag up front rather than letting autosave do it. Autosave is
   * debounced 1.5s, so deferring would race it and could produce duplicates.
   */
  const addTag = useCallback(async () => {
    const name = tagInput.trim();
    if (!name || creatingTag) return;

    const existing = allTags.find(
      (t) => t.name.toLowerCase() === name.toLowerCase()
    );

    setCreatingTag(true);
    try {
      const tag = existing ?? (await createTagAction({ name }));
      if (!tag) return;
      setAllTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
      update((d) => {
        if (!d.tagIds.includes(tag.id)) d.tagIds.push(tag.id);
      });
      setTagInput('');
    } catch (e: any) {
      toast({
        title: 'Could not add tag',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setCreatingTag(false);
    }
  }, [tagInput, creatingTag, allTags, update, toast]);

  const suggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return [];
    return allTags
      .filter((t) => t.name.toLowerCase().includes(q) && !doc.tagIds.includes(t.id))
      .slice(0, 6);
  }, [tagInput, allTags, doc.tagIds]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Category" htmlFor="pb-category" error={errors.categoryId?.[0]}>
          <Select
            value={doc.categoryId}
            onValueChange={(v) => update((d) => (d.categoryId = v))}
          >
            <SelectTrigger id="pb-category" className="w-full">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.length === 0 && (
                <SelectItem value="__none" disabled>
                  No categories yet — add one under Categories
                </SelectItem>
              )}
              {categoryOptions.map((opt) => (
                <SelectItem
                  key={opt.id}
                  value={opt.id}
                  disabled={!opt.selectable}
                  className={opt.selectable ? undefined : 'font-medium opacity-70'}
                >
                  {'\u00A0'.repeat(opt.depth * 3)}
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Tags" htmlFor="pb-tags">
        <div className="flex gap-2">
          <Input
            id="pb-tags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Add a tag and press Enter"
          />
          <Button
            type="button"
            size="icon"
            onClick={addTag}
            disabled={creatingTag}
            aria-label="Add tag"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {suggestions.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="text-xs border rounded px-2 py-1 hover:bg-muted"
                onClick={() => {
                  update((d) => {
                    if (!d.tagIds.includes(tag.id)) d.tagIds.push(tag.id);
                  });
                  setTagInput('');
                }}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}

        {doc.tagIds.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {doc.tagIds.map((tagId) => {
              const tag = tagsById.get(tagId);
              return (
                <span
                  key={tagId}
                  className="inline-flex items-center gap-1 bg-sage-100 dark:bg-sage-900/30 text-sage-700 dark:text-sage-300 px-2 py-1 rounded text-xs"
                >
                  {tag?.name ?? '…'}
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag?.name ?? ''}`}
                    onClick={() =>
                      update((d) => {
                        d.tagIds = d.tagIds.filter((t) => t !== tagId);
                      })
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </Field>

      <div className="space-y-4">
        <ToggleRow
          title="Featured product"
          description="Show in the Featured Products section on the homepage."
          checked={doc.featured}
          onCheckedChange={(v) => update((d) => (d.featured = v))}
        />
        <ToggleRow
          title="Pin to top of New Arrivals"
          description="Float this product above newer arrivals."
          checked={doc.newArrivalPinned}
          onCheckedChange={(v) => update((d) => (d.newArrivalPinned = v))}
        />
        <ToggleRow
          title="Exclude from New Arrivals"
          description="Hide this product from the New Arrivals section entirely."
          checked={doc.excludeFromNewArrivals}
          onCheckedChange={(v) => update((d) => (d.excludeFromNewArrivals = v))}
        />
      </div>

      <Field label="Visibility" htmlFor="pb-visibility">
        <Select
          value={doc.visibility}
          onValueChange={(v) =>
            update((d) => (d.visibility = v as 'public' | 'hidden' | 'search_only'))
          }
        >
          <SelectTrigger id="pb-visibility" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public — visible everywhere</SelectItem>
            <SelectItem value="hidden">Hidden — direct link only</SelectItem>
            <SelectItem value="search_only">Search only — not in listings</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between border rounded-md p-4">
      <div className="space-y-0.5 pr-4">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  );
}
