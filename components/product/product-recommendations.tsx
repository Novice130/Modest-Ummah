import ProductCard from '@/components/product/product-card';
import { fetchRelatedProducts } from '@/lib/actions/product.actions';
import type { Product } from '@/types';

interface ProductRecommendationsProps {
  product: Product;
}

export default async function ProductRecommendations({ product }: ProductRecommendationsProps) {
  let relatedProducts: Product[] = [];

  try {
    relatedProducts = await fetchRelatedProducts(product.id, product.category, 4);
  } catch (error) {
    console.error('Failed to fetch related products:', error);
  }

  if (relatedProducts.length === 0) return null;

  return (
    <section className="py-16 border-t mt-16">
      <h2 className="font-heading text-2xl md:text-3xl mb-8">You May Also Like</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {relatedProducts.map((product, index) => (
          <ProductCard key={product.id} product={product} index={index} />
        ))}
      </div>
    </section>
  );
}
