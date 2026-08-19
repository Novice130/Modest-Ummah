import { fetchProductBySlugOrId, fetchRelatedProducts } from '@/lib/actions/product.actions';
import { json, apiError } from '@/lib/api/v1/http';
import { serializeProduct } from '@/lib/api/v1/serializers';

/** GET /api/v1/products/:slug/related — siblings under the same category. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const limit = Math.min(12, Number(new URL(request.url).searchParams.get('limit')) || 4);

  try {
    const product = await fetchProductBySlugOrId(slug);
    if (!product) return apiError(404, 'Product not found', 'not_found');

    const related = await fetchRelatedProducts(product.id, product.category?.id ?? null, limit);
    return json({ items: related.map(serializeProduct) });
  } catch (error: any) {
    console.error('GET /api/v1/products/[slug]/related', error);
    return apiError(500, 'Could not load related products');
  }
}
