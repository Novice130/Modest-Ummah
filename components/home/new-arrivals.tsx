import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProductCard from '@/components/product/product-card';
import { fetchNewArrivals } from '@/lib/actions/product.actions';
import type { Product } from '@/types';

/**
 * Newest products, straight from the database. No `featured` flag required —
 * anything an admin creates appears here as soon as the product action
 * revalidates `/` (see revalidateProductPaths in lib/actions/product.actions.ts).
 */
export default async function NewArrivals() {
  let products: Product[] = [];
  let failed = false;

  try {
    products = await fetchNewArrivals(8);
  } catch (error) {
    // Log the actual error rather than swallowing it, and show an honest
    // empty state instead of substituting mock products.
    console.error('[NewArrivals] Failed to fetch products:', error);
    failed = true;
  }

  if (products.length === 0) {
    return (
      <section className="py-16 md:py-24">
        <div className="container-custom">
          <h2 className="font-heading text-3xl md:text-4xl mb-2">New Arrivals</h2>
          <p className="text-muted-foreground">
            {failed
              ? 'We could not load new arrivals just now. Please try again shortly.'
              : 'No products yet — check back soon.'}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 md:py-24">
      <div className="container-custom">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-4">
          <div>
            <h2 className="font-heading text-3xl md:text-4xl mb-2">New Arrivals</h2>
            <p className="text-muted-foreground">
              The latest additions to the collection
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/shop?sort=newest">
              Shop New Arrivals <ArrowRight className="ml-2 h-4 w-4" />
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
