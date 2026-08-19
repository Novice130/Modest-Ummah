import { fetchProductBySlugOrId } from '@/lib/actions/product.actions';
import { json, apiError } from '@/lib/api/v1/http';
import { serializeProduct } from '@/lib/api/v1/serializers';

/** GET /api/v1/products/:slug — accepts a slug or a uuid. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const product = await fetchProductBySlugOrId(slug);
    if (!product) return apiError(404, 'Product not found', 'not_found');
    return json(serializeProduct(product));
  } catch (error: any) {
    console.error('GET /api/v1/products/[slug]', error);
    return apiError(500, 'Could not load product');
  }
}
