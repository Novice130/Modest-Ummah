'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Field, fieldProps } from '../field';
import type { useProductBuilder } from '../use-product-builder';

type Builder = ReturnType<typeof useProductBuilder>;

export default function BasicsSection({ builder }: { builder: Builder }) {
  const { doc, update, errors, slugStatus, touchSlug, slugifyName } = builder;

  return (
    <div className="space-y-6">
      <Field
        label="Product name"
        htmlFor="pb-name"
        error={errors.name?.[0]}
      >
        <Input
          {...fieldProps('pb-name', errors.name?.[0])}
          value={doc.name}
          onChange={(e) => {
            const name = e.target.value;
            update((d) => {
              d.name = name;
              // Auto-fill slug from name until the admin edits it manually.
              if (!d.slug || d.slug === slugify(d.name ?? '')) {
                d.slug = slugify(name);
              }
            });
            touchSlug(slugify(name));
          }}
          placeholder="e.g. Classic Sage Thobe"
        />
      </Field>

      <Field
        label="URL slug"
        htmlFor="pb-slug"
        error={errors.slug?.[0]}
        hint={
          slugStatus === 'checking'
            ? 'Checking availability…'
            : slugStatus === 'available'
              ? 'Available'
              : slugStatus === 'taken'
                ? 'Already in use — pick another'
                : 'Lowercase letters, numbers, and hyphens only'
        }
      >
        <Input
          {...fieldProps('pb-slug', errors.slug?.[0])}
          value={doc.slug}
          onChange={(e) => {
            const slug = e.target.value.toLowerCase();
            update((d) => {
              d.slug = slug;
            });
            touchSlug(slug);
          }}
          aria-invalid={!!errors.slug?.[0] || slugStatus === 'taken'}
          placeholder="classic-sage-thobe"
        />
      </Field>

      <Field label="Product type" htmlFor="pb-type">
        <Select
          value={doc.productType}
          onValueChange={(v) =>
            update((d) => {
              d.productType = v as 'simple' | 'variable';
            })
          }
        >
          <SelectTrigger id="pb-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="simple">Simple product</SelectItem>
            <SelectItem value="variable">Variable product (sizes/colors)</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Short description"
        htmlFor="pb-short"
        error={errors.shortDescription?.[0]}
        hint="Shown on product cards and at the top of the product page."
      >
        <Textarea
          {...fieldProps('pb-short', errors.shortDescription?.[0])}
          id="pb-short"
          value={doc.shortDescription}
          onChange={(e) => update((d) => (d.shortDescription = e.target.value))}
          rows={2}
        />
      </Field>

      <div className="space-y-2">
        <Field
          label="Full description (markdown supported)"
          htmlFor="pb-desc"
          error={errors.description?.[0]}
        >
          <Textarea
            {...fieldProps('pb-desc', errors.description?.[0])}
            id="pb-desc"
            value={doc.description}
            onChange={(e) => update((d) => (d.description = e.target.value))}
            rows={8}
            className="font-mono text-sm"
            placeholder={'## Fabric\n\nBreathable cotton blend…'}
          />
        </Field>
        {doc.description && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Preview rendered description
            </summary>
            <div className="mt-2 prose prose-sm dark:prose-invert max-w-none bg-muted/30 p-4 rounded-md">
              <MarkdownPreview source={doc.description} />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

/** Minimal markdown renderer — headings, bold, italic, lists, links, paragraphs. */
function MarkdownPreview({ source }: { source: string }) {
  return (
    <div
      className="whitespace-pre-wrap [&_h1]:text-xl [&_h2]:text-lg [&_h1]:font-bold [&_h2]:font-semibold"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }}
    />
  );
}

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, (_m, label: string, href: string) => {
      // Only http(s)/relative/mailto links survive; anything else (javascript:)
      // is rendered as plain text.
      if (/^(https?:\/\/|\/|#|mailto:)/i.test(href)) {
        return `<a href="${href}">${label}</a>`;
      }
      return label;
    })
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    .replace(/\n/g, '<br/>');
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-');
}
