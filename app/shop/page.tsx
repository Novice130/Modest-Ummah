import { Suspense } from 'react';
import type { Metadata } from 'next';
import ShopContent from '@/components/shop/shop-content';
import ShopFilters from '@/components/shop/shop-filters';
import { ProductCardSkeleton } from '@/components/product/product-card-skeleton';

export const metadata: Metadata = {
  title: 'Shop All Products',
  description: 'Browse our complete collection of modest clothing and accessories. Find thobes, abayas, hijabs, kufis, miswak, attar, and more.',
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
  const params = await searchParams;
  
  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="bg-muted/30 py-12">
        <div className="container-custom">
          <h1 className="font-heading text-3xl md:text-4xl mb-2">Shop All</h1>
          <p className="text-muted-foreground">
            Discover our complete collection of modest clothing and accessories
          </p>
        </div>
      </div>

      <div className="container-custom py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Filters */}
          <aside className="w-full lg:w-64 shrink-0">
            <ShopFilters />
          </aside>

          {/* Products Grid */}
          <main className="flex-1">
            <Suspense
              fallback={
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
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
