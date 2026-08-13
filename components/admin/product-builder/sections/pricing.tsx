'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { DatePicker } from '@/components/ui/date-picker';
import { Field } from '../field';
import type { useProductBuilder } from '../use-product-builder';

type Builder = ReturnType<typeof useProductBuilder>;

export default function PricingSection({ builder }: { builder: Builder }) {
  const { doc, update, errors } = builder;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Regular price ($)" htmlFor="pb-price" error={errors.price?.[0]}>
          <Input
            id="pb-price"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={doc.price}
            aria-invalid={!!errors.price?.[0]}
            aria-describedby={errors.price?.[0] ? 'pb-price-error' : undefined}
            onChange={(e) => update((d) => (d.price = e.target.value))}
          />
        </Field>
        <Field
          label="Compare-at price ($)"
          htmlFor="pb-compare"
          error={errors.compareAtPrice?.[0]}
          hint="The crossed-out 'was' price."
        >
          <Input
            id="pb-compare"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={doc.compareAtPrice ?? ''}
            aria-invalid={!!errors.compareAtPrice?.[0]}
            aria-describedby={errors.compareAtPrice?.[0] ? 'pb-compare-error' : undefined}
            onChange={(e) =>
              update((d) => (d.compareAtPrice = e.target.value === '' ? null : e.target.value))
            }
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Sale starts" htmlFor="pb-sale-start">
          <DatePicker
            date={doc.saleStartsAt ? new Date(doc.saleStartsAt) : undefined}
            onSelect={(date) =>
              update((d) => (d.saleStartsAt = date ? date.toISOString() : null))
            }
            placeholder="No start date"
          />
        </Field>
        <Field label="Sale ends" htmlFor="pb-sale-end">
          <DatePicker
            date={doc.saleEndsAt ? new Date(doc.saleEndsAt) : undefined}
            onSelect={(date) =>
              update((d) => (d.saleEndsAt = date ? date.toISOString() : null))
            }
            placeholder="No end date"
          />
        </Field>
      </div>

      <Field label="Tax class" htmlFor="pb-tax">
        <Input
          id="pb-tax"
          value={doc.taxClass}
          onChange={(e) => update((d) => (d.taxClass = e.target.value))}
          placeholder="Standard (leave empty for default)"
        />
      </Field>

      <AttributesEditor builder={builder} />

      {doc.productType === 'variable' && (
        <VariantsEditor builder={builder} />
      )}
    </div>
  );
}

// ─── Attributes ──────────────────────────────────────────

function AttributesEditor({ builder }: { builder: Builder }) {
  const { doc, update, errors } = builder;

  const addAttribute = () => {
    update((d) => {
      d.attributes.push({ name: '', terms: [], usedForVariations: false });
    });
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Attributes</h3>
          <p className="text-sm text-muted-foreground">
            Define options like Size and Color. Mark attributes used for variations
            to generate the variant matrix.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addAttribute}>
          <Plus className="h-4 w-4 mr-1" /> Add attribute
        </Button>
      </div>

      {doc.attributes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No attributes yet. Simple products don't need them; variable products
          need at least one marked “used for variations”.
        </p>
      )}

      {doc.attributes.map((attr, index) => (
        <div key={index} className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Input
              value={attr.name}
              aria-label={`Attribute ${index + 1} name`}
              placeholder="Attribute name (e.g. Size)"
              onChange={(e) =>
                update((d) => {
                  d.attributes[index].name = e.target.value;
                })
              }
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Delete attribute ${index + 1}`}
              onClick={() =>
                update((d) => {
                  d.attributes.splice(index, 1);
                  // Dropping a variation attribute must drop the matrix.
                  if (attr.usedForVariations) d.variants = [];
                })
              }
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>

          <TermsInput
            terms={attr.terms}
            onChange={(terms) =>
              update((d) => {
                d.attributes[index].terms = terms;
              })
            }
          />

          <div className="flex items-center justify-between border-t pt-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Used for variations</p>
              <p className="text-xs text-muted-foreground">
                Combining terms of all variation attributes builds the matrix.
              </p>
            </div>
            <Switch
              checked={attr.usedForVariations}
              onCheckedChange={(v) =>
                update((d) => {
                  d.attributes[index].usedForVariations = v;
                  d.variants = [];
                })
              }
              aria-label={`Use ${attr.name || 'attribute'} for variations`}
            />
          </div>
        </div>
      ))}
      {errors.attributes && (
        <p className="text-sm text-destructive" role="alert">
          {Object.values(errors.attributes).flat().join('; ')}
        </p>
      )}
    </section>
  );
}

function TermsInput({
  terms,
  onChange,
}: {
  terms: string[];
  onChange: (terms: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const value = input.trim();
    if (!value) return;
    if (!terms.includes(value)) onChange([...terms, value]);
    setInput('');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {terms.map((term) => (
          <span
            key={term}
            className="inline-flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs"
          >
            {term}
            <button
              type="button"
              aria-label={`Remove term ${term}`}
              onClick={() => onChange(terms.filter((t) => t !== term))}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <Input
          value={input}
          placeholder="Add a term and press Enter"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" size="icon" variant="outline" onClick={add} aria-label="Add term">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Variants matrix ─────────────────────────────────────

function VariantsEditor({ builder }: { builder: Builder }) {
  const { doc, update, errors } = builder;
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkStock, setBulkStock] = useState('');
  const [bulkImage, setBulkImage] = useState('');

  const variationAttrs = doc.attributes.filter((a) => a.usedForVariations && a.terms.length > 0);
  const combinationCount = variationAttrs.reduce((n, a) => n * a.terms.length, 0);

  const generateMatrix = () => {
    if (variationAttrs.length === 0 || combinationCount === 0) return;
    update((d) => {
      // Preserve existing rows whose attribute signature still matches, so
      // regenerating does not wipe per-variant data when nothing changed.
      const combos = cartesian(variationAttrs.map((a) => a.terms));
      const prev = new Map(
        d.variants.map((v) => [signature(v.attributes), v])
      );
      d.variants = combos.map((terms, i) => {
        const attrs: Record<string, string> = {};
        variationAttrs.forEach((a, ai) => {
          attrs[a.name] = terms[ai];
        });
        const sig = signature(attrs);
        const existing = prev.get(sig);
        return (
          existing || {
            sku: `${d.sku || 'SKU'}-${i + 1}`,
            attributes: attrs,
            price: null,
            compareAtPrice: null,
            stockQuantity: 0,
            inStock: true,
            image: undefined,
            weight: null,
            position: i,
          }
        );
      });
    });
  };

  const comboCount = useMemo(() => combinationCount, [combinationCount]);

  if (variationAttrs.length === 0) {
    return (
      <section className="space-y-3 border rounded-lg p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Mark at least one attribute as “used for variations” to generate the
          variant matrix.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Variants</h3>
          <p className="text-sm text-muted-foreground">
            {comboCount} combination{comboCount === 1 ? '' : 's'} from{' '}
            {variationAttrs.map((a) => `${a.name} (${a.terms.length})`).join(' × ')}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={generateMatrix}>
          {doc.variants.length === comboCount ? 'Regenerate matrix' : 'Generate matrix'}
        </Button>
      </div>

      {doc.variants.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 bg-muted/40 border rounded-md p-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Bulk edit
            </span>
            <Input
              className="w-28"
              placeholder="Price"
              inputMode="decimal"
              value={bulkPrice}
              onChange={(e) => setBulkPrice(e.target.value)}
            />
            <Input
              className="w-28"
              placeholder="Stock"
              type="number"
              value={bulkStock}
              onChange={(e) => setBulkStock(e.target.value)}
            />
            <Input
              className="w-48"
              placeholder="Image URL (optional)"
              value={bulkImage}
              onChange={(e) => setBulkImage(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              onClick={() =>
                update((d) => {
                  d.variants = d.variants.map((v) => ({
                    ...v,
                    price: bulkPrice || v.price,
                    stockQuantity:
                      bulkStock === '' ? v.stockQuantity : Math.max(0, parseInt(bulkStock, 10) || 0),
                    inStock: bulkStock === '' ? v.inStock : (parseInt(bulkStock, 10) || 0) > 0,
                    image: bulkImage || v.image,
                  }));
                })
              }
            >
              Apply to all
            </Button>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted/60">
                <tr>
                  {variationAttrs.map((a) => (
                    <th key={a.name} className="text-left px-3 py-2 font-medium">
                      {a.name}
                    </th>
                  ))}
                  <th className="text-left px-3 py-2 font-medium">SKU</th>
                  <th className="text-left px-3 py-2 font-medium">Price ($)</th>
                  <th className="text-left px-3 py-2 font-medium">Compare ($)</th>
                  <th className="text-left px-3 py-2 font-medium">Stock</th>
                  <th className="text-left px-3 py-2 font-medium">Image</th>
                  <th className="text-left px-3 py-2 font-medium">Weight</th>
                  <th className="px-3 py-2" aria-label="In stock" />
                </tr>
              </thead>
              <tbody>
                {doc.variants.map((variant, index) => (
                  <tr key={index} className="border-t">
                    {variationAttrs.map((a) => (
                      <td key={a.name} className="px-3 py-2 text-muted-foreground">
                        {variant.attributes[a.name]}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <Input
                        className="w-28"
                        value={variant.sku}
                        aria-label={`SKU for row ${index + 1}`}
                        onChange={(e) =>
                          update((d) => {
                            d.variants[index].sku = e.target.value;
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="w-24"
                        inputMode="decimal"
                        placeholder="Inherit"
                        value={variant.price ?? ''}
                        aria-label={`Price for row ${index + 1}`}
                        onChange={(e) =>
                          update((d) => {
                            d.variants[index].price = e.target.value === '' ? null : e.target.value;
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="w-24"
                        inputMode="decimal"
                        placeholder="—"
                        value={variant.compareAtPrice ?? ''}
                        aria-label={`Compare-at price for row ${index + 1}`}
                        onChange={(e) =>
                          update((d) => {
                            d.variants[index].compareAtPrice =
                              e.target.value === '' ? null : e.target.value;
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="w-20"
                        type="number"
                        min="0"
                        value={variant.stockQuantity}
                        aria-label={`Stock for row ${index + 1}`}
                        onChange={(e) =>
                          update((d) => {
                            d.variants[index].stockQuantity = Math.max(
                              0,
                              parseInt(e.target.value, 10) || 0
                            );
                            d.variants[index].inStock =
                              d.variants[index].stockQuantity > 0;
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="w-40"
                        placeholder="—"
                        value={variant.image || ''}
                        aria-label={`Image URL for row ${index + 1}`}
                        onChange={(e) =>
                          update((d) => {
                            d.variants[index].image = e.target.value || undefined;
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="w-20"
                        inputMode="decimal"
                        placeholder="Inherit"
                        value={variant.weight ?? ''}
                        aria-label={`Weight for row ${index + 1}`}
                        onChange={(e) =>
                          update((d) => {
                            d.variants[index].weight =
                              e.target.value === '' ? null : e.target.value;
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Switch
                        checked={variant.inStock}
                        onCheckedChange={(v) =>
                          update((d) => {
                            d.variants[index].inStock = v;
                          })
                        }
                        aria-label={`In stock for row ${index + 1}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {errors.variants && (
        <p className="text-sm text-destructive" role="alert">
          {Object.values(errors.variants).flat().join('; ')}
        </p>
      )}
    </section>
  );
}

function cartesian(arrays: string[][]): string[][] {
  return arrays.reduce<string[][]>(
    (acc, arr) => acc.flatMap((combo) => arr.map((v) => [...combo, v])),
    [[]]
  );
}

function signature(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
}
