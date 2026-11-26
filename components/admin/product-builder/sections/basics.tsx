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
  const { doc, update, errors, slugStatus, setName, setSlug, persistedStatus } = builder;

  const slugError =
    errors.slug?.[0] ?? (slugStatus === 'taken' ? 'Already used by another product — pick another' : undefined);
  const slugHint =
    slugStatus === 'checking'
      ? 'Checking availability…'
      : `Product URL: /product/${doc.slug || '…'}${
          persistedStatus === 'published' ? ' — changing it breaks existing links to this product' : ''
        }`;

  return (
    <div className="space-y-6">
      <Field label="Product name" htmlFor="pb-name" error={errors.name?.[0]}>
        <Input
          {...fieldProps('pb-name', errors.name?.[0])}
          value={doc.name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sapphire Leaf Y-Necklace Set"
        />
      </Field>

      <Field label="URL slug" htmlFor="pb-slug" error={slugError} hint={slugHint}>
        <Input
          {...fieldProps('pb-slug', slugError)}
          value={doc.slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="Generated from the name"
        />
      </Field>

      <Field
        label="Product type"
        htmlFor="pb-type"
        hint={
          doc.productType === 'simple' && doc.variants.length > 0
            ? `The ${doc.variants.length} saved variant(s) are removed when you save as a simple product.`
            : doc.productType === 'variable'
              ? 'Each option combination gets its own SKU, stock and (optionally) price — set them under Pricing & Options.'
              : 'One SKU and one stock count. Size/Color options can still be offered to shoppers.'
        }
      >
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
            <SelectItem value="variable">Variable product (stock per size/colour)</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Short description"
        htmlFor="pb-short"
        error={errors.shortDescription?.[0]}
        hint={`One or two sentences. Shown with the item details and used as the page description for search and social previews. ${doc.shortDescription.length} characters.`}
      >
        <Textarea
          {...fieldProps('pb-short', errors.shortDescription?.[0])}
          value={doc.shortDescription}
          onChange={(e) => update((d) => (d.shortDescription = e.target.value))}
          rows={2}
        />
      </Field>

      <Field
        label="Full description"
        htmlFor="pb-desc"
        error={errors.description?.[0]}
        hint="Shown under “Item Details” on the product page as plain text (no formatting)."
      >
        <Textarea
          {...fieldProps('pb-desc', errors.description?.[0])}
          value={doc.description}
          onChange={(e) => update((d) => (d.description = e.target.value))}
          rows={8}
          placeholder="Materials, finish, measurements, care…"
        />
      </Field>
    </div>
  );
}
