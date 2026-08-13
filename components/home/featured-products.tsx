import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProductCard from '@/components/product/product-card';
import { fetchFeaturedProducts } from '@/lib/actions/product.actions';
import type { Product } from '@/types';

export default async function FeaturedProducts() {
  let products: Product[] = [];
  let fetchError: unknown = null;

  try {
    const result = await fetchFeaturedProducts();
    products = result.items;
  } catch (error) {
    // Log the real error object instead of discarding it — a dead database
    // must look broken, not silently healthy.
    console.error('Failed to fetch featured products:', error);
    fetchError = error;
  }

  if (products.length === 0) {
    return null;
  }

  return (
    <section className="py-16 md:py-24 bg-muted/30">
      <div className="container-custom">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-4">
          <div>
            <h2 className="font-heading text-3xl md:text-4xl mb-2">Featured Products</h2>
            <p className="text-muted-foreground">
              Discover our most popular items loved by the community
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/shop">
              View All Products <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
