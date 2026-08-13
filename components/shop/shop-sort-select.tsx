'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Client-side sort control for the shop page. The server component cannot
 * wire onValueChange (no event handlers in async components); this extracts
 * the control so desktop sorting actually navigates.
 */
export default function ShopSortSelect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const current = searchParams.get('sort') || 'price-desc';

  const onValueChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'price-desc') {
      params.delete('sort');
    } else {
      params.set('sort', value);
    }
    params.delete('page');
    const qs = params.toString();
    router.push(`/shop${qs ? `?${qs}` : ''}`);
  };

  return (
    <Select value={current} onValueChange={onValueChange}>
      <SelectTrigger className="w-[180px]" aria-label="Sort products">
        <SelectValue placeholder="Sort by" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="newest">Newest</SelectItem>
        <SelectItem value="price-desc">Price: High to Low</SelectItem>
        <SelectItem value="price-asc">Price: Low to High</SelectItem>
        <SelectItem value="name">Name</SelectItem>
      </SelectContent>
    </Select>
  );
}
