'use client';

import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getImageUrl } from '@/lib/utils';
import { Field } from '../field';
import type { useProductBuilder } from '../use-product-builder';

type Builder = ReturnType<typeof useProductBuilder>;

const pad = (n: number) => String(n).padStart(2, '0');

export default function PublishSection({ builder }: { builder: Builder }) {
  const { doc, update, errors, persistedStatus } = builder;

  const publishAt = doc.publishAt ? new Date(doc.publishAt) : undefined;
  const timeValue = publishAt ? `${pad(publishAt.getHours())}:${pad(publishAt.getMinutes())}` : '09:00';

  /** Combine the picked day and the HH:MM field into one local datetime. */
  const setPublishAt = (day: Date | undefined, time: string) => {
    if (!day) {
      update((d) => (d.publishAt = null));
      return;
    }
    const [h, m] = time.split(':').map((n) => parseInt(n, 10) || 0);
    const next = new Date(day);
    next.setHours(h, m, 0, 0);
    update((d) => (d.publishAt = next.toISOString()));
  };

  const ogOptions = doc.ogImage && !doc.images.includes(doc.ogImage) ? [...doc.images, doc.ogImage] : doc.images;
  const titleLength = (doc.metaTitle || doc.name || '').length;
  const descLength = (doc.metaDescription || doc.shortDescription || '').length;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <Field label="Status" htmlFor="pb-status" error={errors.status?.[0]}>
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
              <SelectItem value="draft">Draft — not on the store</SelectItem>
              <SelectItem value="pending">Pending review — not on the store</SelectItem>
              <SelectItem value="scheduled">Scheduled — goes live at a set time</SelectItem>
              <SelectItem value="published">Published — live on the store</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {doc.status === 'scheduled' && (
          <Field
            label="Goes live at"
            htmlFor="pb-publish-time"
            error={errors.publishAt?.[0]}
            hint="Your local time. It appears on the store within about 15 minutes of this time."
          >
            <div className="flex gap-2">
              <DatePicker
                date={publishAt}
                onSelect={(day) => setPublishAt(day, timeValue)}
                placeholder="Pick a date"
                className="flex-1"
              />
              <Input
                id="pb-publish-time"
                type="time"
                className="w-32"
                value={timeValue}
                disabled={!publishAt}
                onChange={(e) => setPublishAt(publishAt, e.target.value || '00:00')}
                aria-label="Publish time"
              />
            </div>
          </Field>
        )}

        {doc.status === 'published' && persistedStatus !== 'published' && (
          <p className="text-sm text-muted-foreground bg-muted/40 border rounded-md p-3">
            Click “Save &amp; publish” to put this product on the store. It then appears in
            New Arrivals and in its category.
          </p>
        )}
        {doc.status !== 'published' && persistedStatus === 'published' && (
          <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md p-3">
            Saving will take this product off the store.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="font-medium">Search &amp; social</h3>
        <Field
          label="Meta title"
          htmlFor="pb-meta-title"
          hint={`${titleLength}/60 characters${doc.metaTitle ? '' : ' — empty uses the product name'}`}
        >
          <Input
            id="pb-meta-title"
            value={doc.metaTitle}
            onChange={(e) => update((d) => (d.metaTitle = e.target.value))}
            placeholder={doc.name || 'Product name'}
          />
        </Field>

        <Field
          label="Meta description"
          htmlFor="pb-meta-desc"
          hint={`${descLength}/160 characters${doc.metaDescription ? '' : ' — empty uses the short description'}`}
        >
          <Textarea
            id="pb-meta-desc"
            rows={2}
            value={doc.metaDescription}
            onChange={(e) => update((d) => (d.metaDescription = e.target.value))}
            placeholder={doc.shortDescription || 'Short summary shown in search results.'}
          />
        </Field>

        <Field label="Social share image" htmlFor="pb-og-image" hint="Empty uses the primary product image.">
          <Select
            value={doc.ogImage || '__primary'}
            onValueChange={(v) => update((d) => (d.ogImage = v === '__primary' ? '' : v))}
          >
            <SelectTrigger id="pb-og-image" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__primary">Primary product image</SelectItem>
              {ogOptions.map((url, i) => (
                <SelectItem key={url} value={url}>
                  <span className="flex items-center gap-2">
                    <span className="relative h-6 w-6 overflow-hidden rounded bg-muted">
                      <Image src={getImageUrl(url)} alt="" fill sizes="24px" className="object-cover" />
                    </span>
                    {doc.images.includes(url) ? `Image ${i + 1}` : 'Image not in gallery'}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      </section>
    </div>
  );
}
