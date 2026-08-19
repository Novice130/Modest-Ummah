import { fetchFeaturedProducts } from '@/lib/actions/product.actions';
import { json, apiError } from '@/lib/api/v1/http';
import { serializeProduct } from '@/lib/api/v1/serializers';

/** GET /api/v1/products/featured */
export async function GET(request: Request) {
  const category = new URL(request.url).searchParams.get('category') || undefined;
  try {
    const result = await fetchFeaturedProducts(category);
    return json({ items: result.items.map(serializeProduct) });
  } catch (error: any) {
    console.error('GET /api/v1/products/featured', error);
    return apiError(500, 'Could not load featured products');
  }
}
