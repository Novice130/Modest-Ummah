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
import { Field } from '../field';
import type { useProductBuilder } from '../use-product-builder';

type Builder = ReturnType<typeof useProductBuilder>;

export default function InventorySection({ builder }: { builder: Builder }) {
  const { doc, update, errors } = builder;

  return (
    <div className="space-y-6">
      <Field label="SKU" htmlFor="pb-sku">
        <Input
          id="pb-sku"
          value={doc.sku}
          onChange={(e) => update((d) => (d.sku = e.target.value))}
          placeholder="e.g. THB-SAGE-M"
        />
      </Field>

      <div className="flex items-center justify-between border rounded-md p-4">
        <div className="space-y-0.5 pr-4">
          <p className="font-medium text-sm">Manage stock</p>
          <p className="text-sm text-muted-foreground">
            Track quantity and mark out of stock automatically.
          </p>
        </div>
        <Switch
          checked={doc.manageStock}
          onCheckedChange={(v) => update((d) => (d.manageStock = v))}
          aria-label="Manage stock"
        />
      </div>

      {doc.manageStock && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Stock quantity" htmlFor="pb-stock">
            <Input
              id="pb-stock"
              type="number"
              min="0"
              value={doc.stockQuantity}
              onChange={(e) =>
                update((d) => (d.stockQuantity = Math.max(0, parseInt(e.target.value, 10) || 0)))
              }
            />
          </Field>

          <Field label="Backorders" htmlFor="pb-backorder">
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
                <SelectItem value="no">Do not allow</SelectItem>
                <SelectItem value="notify">Allow, notify customer</SelectItem>
                <SelectItem value="yes">Allow</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Low-stock threshold" htmlFor="pb-lowstock">
            <Input
              id="pb-lowstock"
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
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Weight (lbs)" htmlFor="pb-weight">
          <Input
            id="pb-weight"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={doc.weight ?? ''}
            onChange={(e) =>
              update((d) => (d.weight = e.target.value === '' ? null : e.target.value))
            }
          />
        </Field>
        <Field label="Length (in)" htmlFor="pb-length">
          <Input
            id="pb-length"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={doc.lengthIn ?? ''}
            onChange={(e) =>
              update((d) => (d.lengthIn = e.target.value === '' ? null : e.target.value))
            }
          />
        </Field>
        <Field label="Width (in)" htmlFor="pb-width">
          <Input
            id="pb-width"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={doc.widthIn ?? ''}
            onChange={(e) =>
              update((d) => (d.widthIn = e.target.value === '' ? null : e.target.value))
            }
          />
        </Field>
        <Field label="Height (in)" htmlFor="pb-height">
          <Input
            id="pb-height"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={doc.heightIn ?? ''}
            onChange={(e) =>
              update((d) => (d.heightIn = e.target.value === '' ? null : e.target.value))
            }
          />
        </Field>
      </div>

      <Field label="Shipping class" htmlFor="pb-shipping">
        <Input
          id="pb-shipping"
          value={doc.shippingClass}
          onChange={(e) => update((d) => (d.shippingClass = e.target.value))}
          placeholder="e.g. Standard, Bulky (leave empty for default)"
        />
      </Field>
    </div>
  );
}
