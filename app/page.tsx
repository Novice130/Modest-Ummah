import { Suspense } from 'react';
import Hero from '@/components/home/hero';
import FeaturedCollections from '@/components/home/featured-collections';
import FeaturedProducts from '@/components/home/featured-products';
import NewArrivals from '@/components/home/new-arrivals';
import Testimonials from '@/components/home/testimonials';
import Features from '@/components/home/features';
import Newsletter from '@/components/home/newsletter';
import { ProductCardSkeleton } from '@/components/product/product-card-skeleton';
import { fetchCategoryTree } from '@/lib/actions/category.actions';

/**
 * Grid shape matches the real sections (grid-cols-2 md:grid-cols-3
 * lg:grid-cols-4) so there is no layout shift when the data resolves.
 */
function ProductGridSkeleton({ title }: { title: string }) {
  return (
    <section className="py-16 md:py-24">
      <div className="container-custom">
        <h2 className="font-heading text-3xl md:text-4xl mb-12">{title}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The collections strip renders the editable category tree, so it is fetched
 * here rather than hardcoded. It sits outside a Suspense boundary because it
 * is above the fold — a cached read, so it does not block prerendering.
 */
async function CollectionsStrip() {
  const categories = await fetchCategoryTree().catch(() => []);
  return <FeaturedCollections categories={categories} />;
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <Suspense fallback={null}>
        <CollectionsStrip />
      </Suspense>
      <Suspense fallback={<ProductGridSkeleton title="New Arrivals" />}>
        <NewArrivals />
      </Suspense>
      <Suspense fallback={<ProductGridSkeleton title="Featured Products" />}>
        <FeaturedProducts />
      </Suspense>
      <Features />
      <Testimonials />
      <Newsletter />
    </>
  );
}
