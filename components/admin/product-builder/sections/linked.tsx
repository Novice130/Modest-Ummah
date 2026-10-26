'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Link2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  fetchProductPickerOptions,
  fetchProductsByIds,
  type PickerOption,
} from '@/lib/actions/product.actions';
import type { useProductBuilder } from '../use-product-builder';

type Builder = ReturnType<typeof useProductBuilder>;

/**
 * Related products. Upsell / cross-sell ids also exist on the row, but no
 * storefront surface reads them, so the builder does not offer pickers that
 * would do nothing; their stored values pass through saves untouched.
 */
export default function LinkedSection({ builder }: { builder: Builder }) {
  const { doc, update, productId } = builder;

  return (
    <LinkedPicker
      title="Related products"
      description="Shown first in “You may also like” on the product page; remaining slots fill with products from the same category."
      selected={doc.similarProductIds}
      excludeId={productId}
      onChange={(ids) => update((d) => (d.similarProductIds = ids))}
    />
  );
}

function LinkedPicker({
  title,
  description,
  selected,
  excludeId,
  onChange,
}: {
  title: string;
  description: string;
  selected: string[];
  excludeId: string | null;
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [selectedRows, setSelectedRows] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState(false);
  const searchSeq = useRef(0);

  // Resolve the stored ids to names. The old version looked them up among
  // the first 50 products alphabetically, so later picks were invisible and
  // could not be removed.
  useEffect(() => {
    if (!selected.length) return;
    fetchProductsByIds(selected)
      .then((rows) => {
        setSelectedRows(rows);
        setResolved(true);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async (q: string) => {
    setQuery(q);
    const seq = ++searchSeq.current;
    if (!q.trim()) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchProductPickerOptions(q, 12, excludeId ?? undefined);
      // Ignore responses that arrive after a newer keystroke's.
      if (seq === searchSeq.current) setOptions(rows.filter((r) => !selected.includes(r.id)));
    } catch {
      // keep previous options
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  };

  const missing = selected.filter((id) => !selectedRows.some((r) => r.id === id));

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" /> {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedRows.map((row) => (
            <span
              key={row.id}
              className="inline-flex items-center gap-2 bg-muted pl-2 pr-1 py-1 rounded text-sm"
            >
              {row.name}
              {row.status !== 'published' && (
                <Badge variant="outline" className="text-[10px] px-1 py-0" title="Not shown until published">
                  {row.status}
                </Badge>
              )}
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
          {missing.length > 0 && resolved && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => onChange(selected.filter((id) => !missing.includes(id)))}
            >
              Remove {missing.length} deleted product{missing.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}

      <Input
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Search published products by name or SKU…"
        aria-label={`Search products for ${title.toLowerCase()}`}
      />

      {loading && <p className="text-sm text-muted-foreground">Searching…</p>}
      {!loading && query.trim() && options.length === 0 && (
        <p className="text-sm text-muted-foreground">No matching published products.</p>
      )}

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
