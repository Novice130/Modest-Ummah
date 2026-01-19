import { Suspense } from 'react';
import Hero from '@/components/home/hero';
import FeaturedCollections from '@/components/home/featured-collections';
import FeaturedProducts from '@/components/home/featured-products';
import Testimonials from '@/components/home/testimonials';
import Features from '@/components/home/features';
import Newsletter from '@/components/home/newsletter';
import { ProductCardSkeleton } from '@/components/product/product-card-skeleton';

export const revalidate = 3600; // Revalidate every hour (ISR)

export default function HomePage() {
  return (
    <>
      <Hero />
      <FeaturedCollections />
      <Suspense
        fallback={
          <section className="py-16">
            <div className="container-custom">
              <h2 className="font-heading text-3xl text-center mb-8">Featured Products</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            </div>
          </section>
        }
      >
        <FeaturedProducts />
      </Suspense>
      <Features />
      <Testimonials />
      <Newsletter />
    </>
  );
}
