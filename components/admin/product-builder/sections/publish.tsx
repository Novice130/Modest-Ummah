'use client';

import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Field } from '../field';
import type { useProductBuilder } from '../use-product-builder';

type Builder = ReturnType<typeof useProductBuilder>;

export default function PublishSection({ builder }: { builder: Builder }) {
  const { doc, update, errors } = builder;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="Meta title"
          htmlFor="pb-meta-title"
          hint={`${(doc.metaTitle || doc.name || '').length}/60 characters`}
        >
          <Input
            id="pb-meta-title"
            value={doc.metaTitle}
            onChange={(e) => update((d) => (d.metaTitle = e.target.value))}
            placeholder={doc.name || 'Product name — Modest Ummah'}
          />
        </Field>
        <Field
          label="OG image URL"
          htmlFor="pb-og-image"
          hint="Leave empty to use the primary product image."
        >
          <Input
            id="pb-og-image"
            value={doc.ogImage}
            onChange={(e) => update((d) => (d.ogImage = e.target.value))}
            placeholder="/api/media/… or /images/…"
          />
        </Field>
      </div>

      <Field
        label="Meta description"
        htmlFor="pb-meta-desc"
        hint={`${(doc.metaDescription || '').length}/160 characters`}
      >
        <Input
          id="pb-meta-desc"
          value={doc.metaDescription}
          onChange={(e) => update((d) => (d.metaDescription = e.target.value))}
          placeholder={doc.shortDescription || 'Short summary shown in search results.'}
        />
      </Field>

      {/* Google-style result preview */}
      <div className="border rounded-lg p-4 bg-background">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
          Search result preview
        </p>
        <p className="text-sm text-sage-700 dark:text-sage-400 truncate">
          modestummah.com › product › {doc.slug || 'your-slug'}
        </p>
        <p className="text-lg text-blue-700 dark:text-blue-400 hover:underline truncate">
          {doc.metaTitle || doc.name || 'Your product title'}
        </p>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {doc.metaDescription || doc.shortDescription || 'Your meta description appears here.'}
        </p>
      </div>

      <Field label="Status" htmlFor="pb-status">
        <Select
          value={doc.status}
          onValueChange={(v) =>
            update((d) => {
              d.status = v as 'draft' | 'pending' | 'scheduled' | 'published';
            })
          }
        >
          <SelectTrigger id="pb-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft — not visible</SelectItem>
            <SelectItem value="pending">Pending review</SelectItem>
            <SelectItem value="scheduled">Scheduled — publish later</SelectItem>
            <SelectItem value="published">Published — live now</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {doc.status === 'scheduled' && (
        <Field
          label="Publish date and time"
          htmlFor="pb-publish-at"
          error={errors.publishAt?.[0]}
        >
          <DatePicker
            date={doc.publishAt ? new Date(doc.publishAt) : undefined}
            onSelect={(date) =>
              update((d) => (d.publishAt = date ? date.toISOString() : null))
            }
            placeholder="Pick publish date"
          />
        </Field>
      )}

      {doc.status === 'published' && (
        <p className="text-sm text-muted-foreground bg-muted/40 border rounded-md p-3">
          Saving will publish this product immediately — it appears in New Arrivals
          on the homepage without a manual restart.
        </p>
      )}
    </div>
  );
}
