'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ChevronDown, X, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CATEGORIES, COLORS, SIZES } from '@/lib/utils';
import { cn } from '@/lib/utils';

const priceRanges = [
  { label: 'Under $25', min: 0, max: 25 },
  { label: '$25 - $50', min: 25, max: 50 },
  { label: '$50 - $100', min: 50, max: 100 },
  { label: '$100 - $200', min: 100, max: 200 },
  { label: 'Over $200', min: 200, max: null },
];

interface FilterSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function FilterSection({ title, children, defaultOpen = true }: FilterSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b pb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full py-2 text-left font-medium"
      >
        {title}
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
        />
      </button>
      {isOpen && <div className="pt-2 space-y-2">{children}</div>}
    </div>
  );
}

export default function ShopFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(name, value);
      } else {
        params.delete(name);
      }
      params.delete('page'); // Reset pagination when filters change
      return params.toString();
    },
    [searchParams]
  );

  const handleFilterChange = (name: string, value: string) => {
    router.push(`${pathname}?${createQueryString(name, value)}`, { scroll: false });
  };

  const clearAllFilters = () => {
    router.push(pathname);
  };

  const activeFilters = Array.from(searchParams.entries()).filter(
    ([key]) => !['page', 'sort'].includes(key)
  );

  const FiltersContent = () => (
    <div className="space-y-4">
      {/* Active Filters */}
      {activeFilters.length > 0 && (
        <div className="pb-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Active Filters</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-xs h-auto py-1"
            >
              Clear All
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeFilters.map(([key, value]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 bg-sage-100 dark:bg-sage-900/30 text-sage-700 dark:text-sage-300 px-2 py-1 rounded-full text-xs"
              >
                {value}
                <button
                  onClick={() => handleFilterChange(key, '')}
                  className="hover:text-sage-900"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Category Filter */}
      <FilterSection title="Category">
        {Object.entries(CATEGORIES).map(([key, category]) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`category-${key}`}
                checked={searchParams.get('category') === key}
                onCheckedChange={(checked) =>
                  handleFilterChange('category', checked ? key : '')
                }
              />
              <Label htmlFor={`category-${key}`} className="text-sm cursor-pointer">
                {category.label}
              </Label>
            </div>
            {searchParams.get('category') === key && (
              <div className="pl-6 space-y-1">
                {category.subcategories.map((sub) => (
                  <div key={sub} className="flex items-center space-x-2">
                    <Checkbox
                      id={`sub-${sub}`}
                      checked={searchParams.get('subcategory') === sub}
                      onCheckedChange={(checked) =>
                        handleFilterChange('subcategory', checked ? sub : '')
                      }
                    />
                    <Label htmlFor={`sub-${sub}`} className="text-xs cursor-pointer">
                      {sub}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </FilterSection>

      {/* Price Filter */}
      <FilterSection title="Price">
        {priceRanges.map((range) => {
          const value = range.max ? `${range.min}-${range.max}` : `${range.min}+`;
          return (
            <div key={value} className="flex items-center space-x-2">
              <Checkbox
                id={`price-${value}`}
                checked={searchParams.get('price') === value}
                onCheckedChange={(checked) =>
                  handleFilterChange('price', checked ? value : '')
                }
              />
              <Label htmlFor={`price-${value}`} className="text-sm cursor-pointer">
                {range.label}
              </Label>
            </div>
          );
        })}
      </FilterSection>

      {/* Color Filter */}
      <FilterSection title="Color">
        <div className="flex flex-wrap gap-2">
          {COLORS.map((color) => (
            <button
              key={color.name}
              onClick={() =>
                handleFilterChange(
                  'color',
                  searchParams.get('color') === color.name ? '' : color.name
                )
              }
              className={cn(
                'w-8 h-8 rounded-full border-2 transition-all',
                searchParams.get('color') === color.name
                  ? 'border-sage-500 ring-2 ring-sage-300 ring-offset-2'
                  : 'border-gray-300'
              )}
              style={{ backgroundColor: color.value }}
              title={color.name}
            />
          ))}
        </div>
      </FilterSection>

      {/* Size Filter */}
      <FilterSection title="Size">
        <div className="flex flex-wrap gap-2">
          {SIZES.map((size) => (
            <button
              key={size}
              onClick={() =>
                handleFilterChange(
                  'size',
                  searchParams.get('size') === size ? '' : size
                )
              }
              className={cn(
                'px-3 py-1 text-sm border rounded-md transition-all',
                searchParams.get('size') === size
                  ? 'bg-sage-300 text-navy-900 border-sage-400'
                  : 'border-gray-300 hover:border-sage-300'
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </FilterSection>
    </div>
  );

  return (
    <>
      {/* Desktop Filters */}
      <div className="hidden lg:block sticky top-24">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-semibold">Filters</h2>
        </div>
        <FiltersContent />
      </div>

      {/* Mobile Filters */}
      <div className="lg:hidden">
        <div className="flex items-center gap-4 mb-4">
          <Dialog open={isMobileOpen} onOpenChange={setIsMobileOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1">
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Filters
                {activeFilters.length > 0 && (
                  <span className="ml-2 bg-sage-300 text-navy-900 px-2 py-0.5 rounded-full text-xs">
                    {activeFilters.length}
                  </span>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Filters</DialogTitle>
              </DialogHeader>
              <FiltersContent />
            </DialogContent>
          </Dialog>

          <Select
            value={searchParams.get('sort') || 'newest'}
            onValueChange={(value) => handleFilterChange('sort', value)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price-asc">Price: Low to High</SelectItem>
              <SelectItem value="price-desc">Price: High to Low</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}
