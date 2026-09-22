import { Suspense } from 'react';
import type { Metadata } from 'next';
import ShopContent from '@/components/shop/shop-content';
import ShopFilters from '@/components/shop/shop-filters';
import { ProductCardSkeleton } from '@/components/product/product-card-skeleton';
import { CategoryPills } from '@/components/shop/category-pills';
import { SurfaceCard } from '@/components/ui/surface-card';
import { fetchCategoryTree } from '@/lib/actions/category.actions';

export const metadata: Metadata = {
  title: 'Shop All Products',
  description: 'Browse our complete collection of modest wear and jewellery.',
};

interface ShopPageProps {
  searchParams: Promise<{
    category?: string;
    subcategory?: string;
    color?: string;
    size?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
    page?: string;
    search?: string;
  }>;
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const [params, categories] = await Promise.all([
    searchParams,
    fetchCategoryTree().catch(() => []),
  ]);
  
  return (
    <div className="min-h-screen bg-background">
      {/* Top Banner / Marketplace Header */}
      <div className="border-b border-black/[0.06] dark:border-white/[0.08] bg-card/60 backdrop-blur-xs py-8 md:py-10">
        <div className="container-custom space-y-4">
          <div>
            <span className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground">
              Marketplace Collection
            </span>
            <h1 className="font-heading text-2xl md:text-3xl lg:text-4xl text-foreground font-semibold mt-1">
              Shop All
            </h1>
          </div>

          {/* Horizontal Category Pill Navigation */}
          {categories.length > 0 && (
            <div className="pt-2">
              <CategoryPills categories={categories} />
            </div>
          )}
        </div>
      </div>

      <div className="container-custom py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Filters enclosed in a SurfaceCard on desktop */}
          <aside className="w-full lg:w-64 shrink-0">
            <SurfaceCard className="p-4 sm:p-5 sticky top-24 hidden lg:block bg-card">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                Filters
              </h2>
              <ShopFilters />
            </SurfaceCard>
            <div className="lg:hidden">
              <ShopFilters />
            </div>
          </aside>

          {/* Products Grid */}
          <main className="flex-1">
            <Suspense
              fallback={
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-5">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              }
            >
              <ShopContent searchParams={params} />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
