'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getImageUrl, cn } from '@/lib/utils';
import {
  DEFAULT_SWATCH,
  errorsUnder,
  moneyString,
  optionKind,
} from '@/lib/product-builder-schema';
import { Field, fieldProps } from '../field';
import { variantSignature, type useProductBuilder } from '../use-product-builder';

type Builder = ReturnType<typeof useProductBuilder>;

/** WooCommerce's built-in classes — what the Pirate Ship connector reports. */
const TAX_CLASSES = [
  { value: '', label: 'Standard' },
  { value: 'reduced-rate', label: 'Reduced rate' },
  { value: 'zero-rate', label: 'Zero rate' },
];

const endOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

export default function PricingSection({ builder }: { builder: Builder }) {
  const { doc, update, errors } = builder;
  const taxOptions = TAX_CLASSES.some((t) => t.value === doc.taxClass)
    ? TAX_CLASSES
    : [...TAX_CLASSES, { value: doc.taxClass, label: doc.taxClass }];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="Price ($)"
          htmlFor="pb-price"
          error={errors.price?.[0]}
          hint={
            doc.productType === 'variable'
              ? 'Charged for every variant that has no price of its own.'
              : 'What the customer pays.'
          }
        >
          <Input
            {...fieldProps('pb-price', errors.price?.[0])}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={doc.price}
            onChange={(e) => update((d) => (d.price = e.target.value))}
          />
        </Field>
        <Field
          label="Compare-at price ($)"
          htmlFor="pb-compare"
          error={errors.compareAtPrice?.[0]}
          hint="Optional original price, shown crossed out next to the price."
        >
          <Input
            {...fieldProps('pb-compare', errors.compareAtPrice?.[0])}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={doc.compareAtPrice ?? ''}
            onChange={(e) =>
              update((d) => (d.compareAtPrice = e.target.value === '' ? null : e.target.value))
            }
          />
        </Field>
      </div>

      {doc.compareAtPrice && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Sale badge from" htmlFor="pb-sale-start" error={errors.saleStartsAt?.[0]}>
              <DatePicker
                date={doc.saleStartsAt ? new Date(doc.saleStartsAt) : undefined}
                onSelect={(date) =>
                  update((d) => (d.saleStartsAt = date ? date.toISOString() : null))
                }
                placeholder="Immediately"
              />
            </Field>
            <Field label="Sale badge until (end of day)" htmlFor="pb-sale-end" error={errors.saleEndsAt?.[0]}>
              <DatePicker
                date={doc.saleEndsAt ? new Date(doc.saleEndsAt) : undefined}
                onSelect={(date) =>
                  update((d) => (d.saleEndsAt = date ? endOfDay(date).toISOString() : null))
                }
                placeholder="No end date"
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Optional. Controls when the app labels this product “on sale”. The price charged
            is always the price above, and the web shop shows the compare-at price whenever
            it is set.
          </p>
        </div>
      )}

      <Field
        label="Tax class"
        htmlFor="pb-tax"
        hint="Reported to shipping/fulfilment integrations. Sales tax at checkout is calculated from the product's category."
      >
        <Select
          value={doc.taxClass || '__standard'}
          onValueChange={(v) => update((d) => (d.taxClass = v === '__standard' ? '' : v))}
        >
          <SelectTrigger id="pb-tax" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {taxOptions.map((t) => (
              <SelectItem key={t.value || '__standard'} value={t.value || '__standard'}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <OptionsEditor builder={builder} />

      {doc.productType === 'variable' && <VariantsEditor builder={builder} />}
    </div>
  );
}

// ─── Options (attributes) ────────────────────────────────

function OptionsEditor({ builder }: { builder: Builder }) {
  const { doc, update, errors } = builder;
  const isVariable = doc.productType === 'variable';
  const has = (kind: 'size' | 'color') => doc.attributes.some((a) => optionKind(a.name) === kind);

  const addOption = (name = '') => {
    update((d) => {
      d.attributes.push({ name, terms: [], usedForVariations: isVariable && name !== '' });
    });
  };

  const optionErrors = Object.entries(errors)
    .filter(([key]) => key === 'attributes' || key.startsWith('attributes.'))
    .flatMap(([, m]) => m);

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium">Options</h3>
          <p className="text-sm text-muted-foreground">
            An option named <strong>Size</strong> or <strong>Color</strong> becomes the size
            picker / colour swatches on the product page. Other options (e.g. Material) are
            saved with the product{isVariable ? ' and can drive variants' : ''}.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {!has('size') && (
            <Button type="button" variant="outline" size="sm" onClick={() => addOption('Size')}>
              <Plus className="h-4 w-4 mr-1" /> Size
            </Button>
          )}
          {!has('color') && (
            <Button type="button" variant="outline" size="sm" onClick={() => addOption('Color')}>
              <Plus className="h-4 w-4 mr-1" /> Color
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => addOption()}>
            <Plus className="h-4 w-4 mr-1" /> Other
          </Button>
        </div>
      </div>

      {doc.attributes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No options. {isVariable ? 'A variable product needs at least one.' : 'Most single-size items need none.'}
        </p>
      )}

      {doc.attributes.map((attr, index) => {
        const kind = optionKind(attr.name);
        return (
          <div key={index} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Input
                value={attr.name}
                aria-label={`Option ${index + 1} name`}
                placeholder="Option name (e.g. Size)"
                aria-invalid={!!errors[`attributes.${index}.name`]}
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
                aria-label={`Delete option ${attr.name || index + 1}`}
                onClick={() =>
                  update((d) => {
                    d.attributes.splice(index, 1);
                  })
                }
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            <TermsInput
              terms={attr.terms}
              swatches={kind === 'color' ? doc.colorSwatches : undefined}
              onSwatch={(term, value) =>
                update((d) => {
                  d.colorSwatches[term] = value;
                })
              }
              onChange={(terms) =>
                update((d) => {
                  d.attributes[index].terms = terms;
                })
              }
            />
            {kind === 'size' && attr.terms.length === 1 && attr.terms[0] === 'One Size' && (
              <p className="text-xs text-muted-foreground">“One Size” hides the size picker on the product page.</p>
            )}

            {isVariable && (
              <div className="flex items-center justify-between border-t pt-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Used for variations</p>
                  <p className="text-xs text-muted-foreground">
                    Each value gets its own variant row (SKU, stock, price).
                  </p>
                </div>
                <Switch
                  checked={attr.usedForVariations}
                  onCheckedChange={(v) =>
                    update((d) => {
                      d.attributes[index].usedForVariations = v;
                    })
                  }
                  aria-label={`Use ${attr.name || 'option'} for variations`}
                />
              </div>
            )}
          </div>
        );
      })}
      {optionErrors.length > 0 && (
        <p className="text-sm text-destructive" role="alert">
          {[...new Set(optionErrors)].join('; ')}
        </p>
      )}
    </section>
  );
}

function TermsInput({
  terms,
  onChange,
  swatches,
  onSwatch,
}: {
  terms: string[];
  onChange: (terms: string[]) => void;
  /** Present for the Color option: one swatch colour per value. */
  swatches?: Record<string, string>;
  onSwatch: (term: string, value: string) => void;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    // Accept "S, M, L" in one go.
    const values = input
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length === 0) return;
    onChange([...terms, ...values.filter((v, i) => !terms.includes(v) && values.indexOf(v) === i)]);
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
            {swatches && (
              <input
                type="color"
                className="h-4 w-4 cursor-pointer rounded-full border-0 bg-transparent p-0"
                value={/^#[0-9a-f]{6}$/i.test(swatches[term] ?? '') ? swatches[term] : DEFAULT_SWATCH}
                onChange={(e) => onSwatch(term, e.target.value)}
                aria-label={`Swatch colour for ${term}`}
                title="Swatch colour shown on the product page"
              />
            )}
            {term}
            <button
              type="button"
              aria-label={`Remove value ${term}`}
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
          placeholder="Add values, e.g. S, M, L — press Enter"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" size="icon" variant="outline" onClick={add} aria-label="Add value">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Variants matrix ─────────────────────────────────────

const skuPart = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || 'X';

function VariantsEditor({ builder }: { builder: Builder }) {
  const { doc, update, errors } = builder;
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkStock, setBulkStock] = useState('');
  const [bulkImage, setBulkImage] = useState('');

  const variationAttrs = doc.attributes.filter((a) => a.usedForVariations && a.terms.length > 0);
  const combinationCount = variationAttrs.reduce((n, a) => n * a.terms.length, 1);
  const variantErrors = errorsUnder(errors, 'variants');
  const bulkPriceValid = bulkPrice === '' || moneyString.safeParse(bulkPrice).success;

  const generateMatrix = () => {
    if (variationAttrs.length === 0) return;
    update((d) => {
      // Keep rows whose combination still exists, so regenerating after
      // adding a value does not wipe per-variant SKU/stock/price.
      const combos = cartesian(variationAttrs.map((a) => a.terms));
      const prev = new Map(d.variants.map((v) => [variantSignature(v.attributes), v]));
      const base = (d.sku || d.slug || 'SKU').toUpperCase();
      d.variants = combos.map((terms, i) => {
        const attrs: Record<string, string> = {};
        variationAttrs.forEach((a, ai) => {
          attrs[a.name] = terms[ai];
        });
        return (
          prev.get(variantSignature(attrs)) || {
            sku: `${base}-${terms.map(skuPart).join('-')}`,
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

  if (variationAttrs.length === 0) {
    return (
      <section className="space-y-3 border rounded-lg p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Turn on “Used for variations” for at least one option (with values) to create variants.
        </p>
        {variantErrors.length > 0 && (
          <p className="text-sm text-destructive" role="alert">{variantErrors[0]}</p>
        )}
      </section>
    );
  }

  const rowHasError = (index: number) => errorsUnder(errors, `variants.${index}`).length > 0;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-medium">Variants</h3>
          <p className="text-sm text-muted-foreground">
            {combinationCount} combination{combinationCount === 1 ? '' : 's'} from{' '}
            {variationAttrs.map((a) => `${a.name} (${a.terms.length})`).join(' × ')}
            {doc.variants.length > 0 && ` · ${doc.variants.length} row${doc.variants.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={generateMatrix}>
          {doc.variants.length > 0 ? 'Update variants from options' : 'Generate variants'}
        </Button>
      </div>

      {doc.variants.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 bg-muted/40 border rounded-md p-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Set for all rows
            </span>
            <Input
              className="w-28"
              placeholder="Price"
              inputMode="decimal"
              value={bulkPrice}
              aria-invalid={!bulkPriceValid}
              aria-label="Price for all variants"
              onChange={(e) => setBulkPrice(e.target.value)}
            />
            {doc.manageStock && (
              <Input
                className="w-28"
                placeholder="Stock"
                type="number"
                min="0"
                aria-label="Stock for all variants"
                value={bulkStock}
                onChange={(e) => setBulkStock(e.target.value)}
              />
            )}
            {doc.images.length > 0 && (
              <ImageSelect
                images={doc.images}
                value={bulkImage}
                onChange={setBulkImage}
                label="Image for all variants"
                placeholder="Image"
              />
            )}
            <Button
              type="button"
              size="sm"
              disabled={!bulkPriceValid || (bulkPrice === '' && bulkStock === '' && bulkImage === '')}
              onClick={() => {
                update((d) => {
                  d.variants = d.variants.map((v) => ({
                    ...v,
                    price: bulkPrice || v.price,
                    stockQuantity:
                      bulkStock === '' ? v.stockQuantity : Math.max(0, parseInt(bulkStock, 10) || 0),
                    image: bulkImage || v.image,
                  }));
                });
                setBulkPrice('');
                setBulkStock('');
                setBulkImage('');
              }}
            >
              Apply
            </Button>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-muted/60">
                <tr>
                  {variationAttrs.map((a) => (
                    <th key={a.name} className="text-left px-3 py-2 font-medium">
                      {a.name}
                    </th>
                  ))}
                  <th className="text-left px-3 py-2 font-medium">SKU</th>
                  <th className="text-left px-3 py-2 font-medium">Price ($)</th>
                  <th className="text-left px-3 py-2 font-medium">Compare-at ($)</th>
                  <th className="text-left px-3 py-2 font-medium">
                    {doc.manageStock ? 'Stock' : 'In stock'}
                  </th>
                  <th className="text-left px-3 py-2 font-medium">Image</th>
                  <th className="text-left px-3 py-2 font-medium">Weight (oz)</th>
                  <th className="px-3 py-2" aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {doc.variants.map((variant, index) => (
                  <tr
                    key={variant.id ?? variantSignature(variant.attributes)}
                    className={cn('border-t', rowHasError(index) && 'bg-destructive/5')}
                  >
                    {variationAttrs.map((a) => (
                      <td key={a.name} className="px-3 py-2 text-muted-foreground">
                        {variant.attributes[a.name] ?? '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <Input
                        className="w-36"
                        value={variant.sku}
                        aria-label={`SKU for row ${index + 1}`}
                        aria-invalid={!!errors[`variants.${index}.sku`]}
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
                        placeholder={doc.price || 'Inherit'}
                        value={variant.price ?? ''}
                        aria-label={`Price for row ${index + 1}`}
                        aria-invalid={!!errors[`variants.${index}.price`]}
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
                        aria-invalid={!!errors[`variants.${index}.compareAtPrice`]}
                        onChange={(e) =>
                          update((d) => {
                            d.variants[index].compareAtPrice =
                              e.target.value === '' ? null : e.target.value;
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      {doc.manageStock ? (
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
                            })
                          }
                        />
                      ) : (
                        <Switch
                          checked={variant.inStock}
                          onCheckedChange={(v) =>
                            update((d) => {
                              d.variants[index].inStock = v;
                            })
                          }
                          aria-label={`In stock for row ${index + 1}`}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <ImageSelect
                        images={doc.images}
                        value={variant.image ?? ''}
                        onChange={(url) =>
                          update((d) => {
                            d.variants[index].image = url || undefined;
                          })
                        }
                        label={`Image for row ${index + 1}`}
                        placeholder="Main image"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="w-20"
                        inputMode="decimal"
                        placeholder={doc.weight || 'Inherit'}
                        value={variant.weight ?? ''}
                        aria-label={`Weight in ounces for row ${index + 1}`}
                        onChange={(e) =>
                          update((d) => {
                            d.variants[index].weight =
                              e.target.value === '' ? null : e.target.value;
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove row ${index + 1}`}
                        title="Remove this combination (it will not be sold)"
                        onClick={() =>
                          update((d) => {
                            d.variants.splice(index, 1);
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Empty price or weight uses the product&apos;s. Per-variant price and stock apply to
            orders that select a variant (app/API checkout). The web shop shows the Size/Color
            pickers and sells at the product price, with stock as the total across variants.
          </p>
        </>
      )}
      {variantErrors.length > 0 && (
        <ul className="text-sm text-destructive space-y-0.5" role="alert">
          {[...new Set(variantErrors)].slice(0, 6).map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ImageSelect({
  images,
  value,
  onChange,
  label,
  placeholder,
}: {
  images: string[];
  value: string;
  onChange: (url: string) => void;
  label: string;
  placeholder: string;
}) {
  // A variant image that is no longer in the gallery still shows, so it can
  // be cleared.
  const options = value && !images.includes(value) ? [...images, value] : images;
  return (
    <Select value={value || '__none'} onValueChange={(v) => onChange(v === '__none' ? '' : v)}>
      <SelectTrigger className="w-36" aria-label={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">{placeholder}</SelectItem>
        {options.map((url, i) => (
          <SelectItem key={url} value={url}>
            <span className="flex items-center gap-2">
              <span className="relative h-6 w-6 overflow-hidden rounded bg-muted">
                <Image src={getImageUrl(url)} alt="" fill sizes="24px" className="object-cover" />
              </span>
              {images.includes(url) ? `Image ${i + 1}` : 'Removed image'}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function cartesian(arrays: string[][]): string[][] {
  return arrays.reduce<string[][]>(
    (acc, arr) => acc.flatMap((combo) => arr.map((v) => [...combo, v])),
    [[]]
  );
}
