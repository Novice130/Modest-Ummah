'use client';

import { useState } from 'react';
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
import { CATEGORIES } from '@/lib/utils';
import { Field } from '../field';
import type { useProductBuilder } from '../use-product-builder';

type Builder = ReturnType<typeof useProductBuilder>;

export default function OrganizationSection({ builder }: { builder: Builder }) {
  const { doc, update, errors } = builder;
  const [tagInput, setTagInput] = useState('');

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    update((d) => {
      if (!d.tags.includes(tag)) d.tags.push(tag);
    });
    setTagInput('');
  };

  const categoryOptions = Object.entries(CATEGORIES) as Array<
    [string, { label: string; subcategories: readonly string[] }]
  >;
  const currentSubs: readonly string[] =
    (CATEGORIES[doc.category as keyof typeof CATEGORIES]?.subcategories as readonly string[]) || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Category" htmlFor="pb-category" error={errors.category?.[0]}>
          <Select
            value={doc.category}
            onValueChange={(v) =>
              update((d) => {
                d.category = v as 'men' | 'women' | 'accessories';
                // Reset subcategory when it no longer belongs.
                const subs =
                  CATEGORIES[v as keyof typeof CATEGORIES]?.subcategories ?? [];
                if (!(subs as readonly string[]).includes(d.subcategory)) d.subcategory = '';
              })
            }
          >
            <SelectTrigger id="pb-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map(([key, cat]) => (
                <SelectItem key={key} value={key}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Subcategory"
          htmlFor="pb-subcategory"
          error={errors.subcategory?.[0]}
        >
          <Select
            value={doc.subcategory}
            onValueChange={(v) => update((d) => (d.subcategory = v))}
          >
            <SelectTrigger id="pb-subcategory" className="w-full">
              <SelectValue placeholder="Select subcategory" />
            </SelectTrigger>
            <SelectContent>
              {currentSubs.map((sub: string) => (
                <SelectItem key={sub} value={sub}>
                  {sub}
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
          <Button type="button" size="icon" onClick={addTag} aria-label="Add tag">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {doc.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 bg-sage-100 dark:bg-sage-900/30 text-sage-700 dark:text-sage-300 px-2 py-1 rounded text-xs"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() =>
                    update((d) => {
                      d.tags = d.tags.filter((t) => t !== tag);
                    })
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
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
