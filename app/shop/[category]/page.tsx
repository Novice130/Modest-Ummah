import { Suspense } from 'react';
import type { Metadata } from 'next';
import ShopContent from '@/components/shop/shop-content';
import ShopFilters from '@/components/shop/shop-filters';
import { ProductCardSkeleton } from '@/components/product/product-card-skeleton';
import { CATEGORIES } from '@/lib/utils';

interface CategoryPageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<{
    subcategory?: string;
    color?: string;
    size?: string;
    price?: string;
    sort?: string;
    page?: string;
    search?: string;
  }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category } = await params;
  const categoryData = CATEGORIES[category as keyof typeof CATEGORIES];
  
  if (!categoryData) {
    return { title: 'Shop' };
  }

  return {
    title: `Shop ${categoryData.label}`,
    description: `Browse our ${categoryData.label.toLowerCase()} collection. ${categoryData.subcategories.join(', ')} and more.`,
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { category } = await params;
  const search = await searchParams;
  const categoryData = CATEGORIES[category as keyof typeof CATEGORIES];

  if (!categoryData) {
    return (
      <div className="container-custom py-16 text-center">
        <h1 className="font-heading text-3xl mb-4">Category Not Found</h1>
        <p className="text-muted-foreground">The category you&apos;re looking for doesn&apos;t exist.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="bg-muted/30 py-12">
        <div className="container-custom">
          <h1 className="font-heading text-3xl md:text-4xl mb-2">{categoryData.label}</h1>
          <p className="text-muted-foreground">
            {categoryData.subcategories.join(' • ')}
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
              <ShopContent searchParams={{ ...search, category }} />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}

export function generateStaticParams() {
  return Object.keys(CATEGORIES).map((category) => ({
    category,
  }));
}
