'use client';

import { useEffect, useState } from 'react';
import { X, Link2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchProductPickerOptions } from '@/lib/actions/product.actions';
import { Field } from '../field';
import type { useProductBuilder } from '../use-product-builder';

type Builder = ReturnType<typeof useProductBuilder>;

interface PickerOption {
  id: string;
  name: string;
  sku: string;
  image: string | null;
}

export default function LinkedSection({ builder }: { builder: Builder }) {
  const { doc, update } = builder;

  return (
    <div className="space-y-8">
      <LinkedPicker
        title="Upsells"
        description="Better, pricier alternatives suggested to the buyer."
        selected={doc.upsellIds}
        onChange={(ids) => update((d) => (d.upsellIds = ids))}
        allIds={[new Set([...doc.upsellIds, ...doc.crossSellIds, ...doc.similarProductIds])]}
      />
      <LinkedPicker
        title="Cross-sells"
        description="Related products that pair with this one."
        selected={doc.crossSellIds}
        onChange={(ids) => update((d) => (d.crossSellIds = ids))}
        allIds={[new Set([...doc.upsellIds, ...doc.crossSellIds, ...doc.similarProductIds])]}
      />
      <LinkedPicker
        title="Similar products"
        description="Shown in the 'You may also like' section on the product page."
        selected={doc.similarProductIds}
        onChange={(ids) => update((d) => (d.similarProductIds = ids))}
        allIds={[new Set([...doc.upsellIds, ...doc.crossSellIds, ...doc.similarProductIds])]}
      />
    </div>
  );
}

function LinkedPicker({
  title,
  description,
  selected,
  onChange,
  allIds,
}: {
  title: string;
  description: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  allIds: [Set<string>];
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [selectedRows, setSelectedRows] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [excluded] = allIds;

  useEffect(() => {
    if (!selected.length) return;
    fetchProductPickerOptions('', 50).then((rows) => {
      setSelectedRows(rows.filter((r) => selected.includes(r.id)));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async (q: string) => {
    setQuery(q);
    if (!q) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchProductPickerOptions(q, 12);
      setOptions(rows.filter((r) => !selected.includes(r.id) && !excluded.has(r.id)));
    } catch {
      // keep previous options
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" /> {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {selectedRows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedRows.map((row) => (
            <span
              key={row.id}
              className="inline-flex items-center gap-2 bg-muted pl-2 pr-1 py-1 rounded text-sm"
            >
              {row.name}
              <button
                type="button"
                aria-label={`Remove ${row.name}`}
                onClick={() => {
                  onChange(selected.filter((id) => id !== row.id));
                  setSelectedRows((prev) => prev.filter((r) => r.id !== row.id));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Search products by name or SKU…"
          aria-label={`Search products for ${title.toLowerCase()}`}
        />
      </div>

      {loading && <p className="text-sm text-muted-foreground">Searching…</p>}

      {options.length > 0 && (
        <ul className="border rounded-md divide-y max-h-56 overflow-y-auto">
          {options.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between"
                onClick={() => {
                  onChange([...selected, row.id]);
                  setSelectedRows((prev) => [...prev, row]);
                  setOptions((prev) => prev.filter((o) => o.id !== row.id));
                  setQuery('');
                }}
              >
                <span className="text-sm">{row.name}</span>
                <span className="text-xs text-muted-foreground">{row.sku}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
