'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { CategoryNode } from '@/types';

interface CategoryPillsProps {
  categories: CategoryNode[];
  activeSlug?: string;
  className?: string;
}

export function CategoryPills({
  categories,
  activeSlug,
  className,
}: CategoryPillsProps) {
  const isAll = !activeSlug;

  return (
    <div className={cn('relative w-full overflow-hidden', className)}>
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-2 px-1">
        {/* 'All' Pill */}
        <Link
          href="/shop"
          className={cn(
            'inline-flex items-center justify-center whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 shrink-0',
            isAll
              ? 'bg-foreground text-background shadow-xs'
              : 'bg-card text-foreground border border-black/[0.08] dark:border-white/[0.12] hover:bg-muted'
          )}
        >
          All
        </Link>

        {/* Dynamic Category Pills */}
        {categories.map((cat) => {
          const isSelected = activeSlug === cat.slug;
          return (
            <Link
              key={cat.id}
              href={`/shop/${cat.slug}`}
              className={cn(
                'inline-flex items-center justify-center whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 shrink-0',
                isSelected
                  ? 'bg-foreground text-background shadow-xs'
                  : 'bg-card text-foreground border border-black/[0.08] dark:border-white/[0.12] hover:bg-muted'
              )}
            >
              {cat.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default CategoryPills;
