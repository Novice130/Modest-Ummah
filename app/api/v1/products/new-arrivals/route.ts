import { fetchNewArrivals } from '@/lib/actions/product.actions';
import { json, apiError } from '@/lib/api/v1/http';
import { serializeProduct } from '@/lib/api/v1/serializers';

/** GET /api/v1/products/new-arrivals */
export async function GET(request: Request) {
  const limit = Math.min(24, Number(new URL(request.url).searchParams.get('limit')) || 8);
  try {
    const items = await fetchNewArrivals(limit);
    return json({ items: items.map(serializeProduct) });
  } catch (error: any) {
    console.error('GET /api/v1/products/new-arrivals', error);
    return apiError(500, 'Could not load new arrivals');
  }
}
