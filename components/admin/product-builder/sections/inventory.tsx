'use client';

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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

export default function InventorySection({ builder }: { builder: Builder }) {
  const { doc, update, errors } = builder;
  const isVariable = doc.productType === 'variable';
  const variantTotal = doc.variants.reduce((n, v) => n + v.stockQuantity, 0);

  const decimalField = (
    key: 'weight' | 'lengthIn' | 'widthIn' | 'heightIn',
    label: string,
    id: string
  ) => (
    <Field label={label} htmlFor={id} error={errors[key]?.[0]}>
      <Input
        {...fieldProps(id, errors[key]?.[0])}
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        value={doc[key] ?? ''}
        onChange={(e) => update((d) => (d[key] = e.target.value === '' ? null : e.target.value))}
      />
    </Field>
  );

  return (
    <div className="space-y-6">
      <Field
        label="SKU"
        htmlFor="pb-sku"
        error={errors.sku?.[0]}
        hint={
          isVariable
            ? 'Parent SKU. Each variant has its own SKU under Pricing & Options.'
            : 'Must be unique. Printed on packing slips and sent to Pirate Ship.'
        }
      >
        <Input
          {...fieldProps('pb-sku', errors.sku?.[0])}
          value={doc.sku}
          onChange={(e) => update((d) => (d.sku = e.target.value))}
          placeholder="e.g. MU-JWL-NS-001"
        />
      </Field>

      <div className="flex items-center justify-between border rounded-md p-4">
        <div className="space-y-0.5 pr-4">
          <p className="font-medium text-sm">Track stock</p>
          <p className="text-sm text-muted-foreground">
            Count units, subtract them on each paid order, and show “Out of stock” at zero.
          </p>
        </div>
        <Switch
          checked={doc.manageStock}
          onCheckedChange={(v) => update((d) => (d.manageStock = v))}
          aria-label="Track stock"
        />
      </div>

      {doc.manageStock ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {isVariable ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Stock quantity</p>
              <p className="text-sm">
                {variantTotal} <span className="text-muted-foreground">across {doc.variants.length} variant{doc.variants.length === 1 ? '' : 's'}</span>
              </p>
              <p className="text-xs text-muted-foreground">Set per variant under Pricing &amp; Options.</p>
            </div>
          ) : (
            <Field label="Stock quantity" htmlFor="pb-stock" error={errors.stockQuantity?.[0]}>
              <Input
                {...fieldProps('pb-stock', errors.stockQuantity?.[0])}
                type="number"
                min="0"
                value={doc.stockQuantity}
                onChange={(e) =>
                  update((d) => (d.stockQuantity = Math.max(0, parseInt(e.target.value, 10) || 0)))
                }
              />
            </Field>
          )}

          <Field
            label="When sold out"
            htmlFor="pb-backorder"
            hint={doc.backorderPolicy === 'no' ? undefined : 'The product stays buyable at zero stock.'}
          >
            <Select
              value={doc.backorderPolicy}
              onValueChange={(v) =>
                update((d) => (d.backorderPolicy = v as 'no' | 'notify' | 'yes'))
              }
            >
              <SelectTrigger id="pb-backorder" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no">Stop selling</SelectItem>
                <SelectItem value="notify">Allow backorders, tell the customer</SelectItem>
                <SelectItem value="yes">Allow backorders</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Low-stock alert at"
            htmlFor="pb-lowstock"
            error={errors.lowStockThreshold?.[0]}
            hint="Listed under Low stock on the dashboard at or below this."
          >
            <Input
              {...fieldProps('pb-lowstock', errors.lowStockThreshold?.[0])}
              type="number"
              min="0"
              value={doc.lowStockThreshold}
              onChange={(e) =>
                update((d) =>
                  (d.lowStockThreshold = Math.max(0, parseInt(e.target.value, 10) || 0))
                )
              }
            />
          </Field>
        </div>
      ) : isVariable ? (
        <p className="text-sm text-muted-foreground border rounded-md p-4">
          Stock is not counted. Mark each variant in or out of stock under Pricing &amp; Options.
        </p>
      ) : (
        <div className="flex items-center justify-between border rounded-md p-4">
          <div className="space-y-0.5 pr-4">
            <p className="font-medium text-sm">In stock</p>
            <p className="text-sm text-muted-foreground">
              Without tracking, this switch alone decides whether the product can be bought.
            </p>
          </div>
          <Switch
            checked={doc.inStock}
            onCheckedChange={(v) => update((d) => (d.inStock = v))}
            aria-label="In stock"
          />
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Shipping</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {decimalField('weight', 'Weight (oz)', 'pb-weight')}
          {decimalField('lengthIn', 'Length (in)', 'pb-length')}
          {decimalField('widthIn', 'Width (in)', 'pb-width')}
          {decimalField('heightIn', 'Height (in)', 'pb-height')}
        </div>
        <p className="text-xs text-muted-foreground">
          Packed weight of one unit in ounces (16 oz = 1 lb), used for shipping quotes and labels.
          Left empty, checkout assumes 8 oz. Dimensions pick the box; empty uses a box sized by weight.
        </p>
      </div>

      <Field
        label="Shipping class"
        htmlFor="pb-shipping"
        hint="Stored for reference only — shipping rates do not use it yet."
      >
        <Input
          id="pb-shipping"
          value={doc.shippingClass}
          onChange={(e) => update((d) => (d.shippingClass = e.target.value))}
          placeholder="e.g. Fragile (optional)"
        />
      </Field>
    </div>
  );
}
