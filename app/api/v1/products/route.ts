import { fetchProducts, fetchSearchProducts } from '@/lib/actions/product.actions';
import { json, apiError, parsePagination, parseSort } from '@/lib/api/v1/http';
import { serializeProduct } from '@/lib/api/v1/serializers';

/**
 * GET /api/v1/products
 *   ?category=<slug>   matches the category AND every descendant
 *   ?tag=<slug>
 *   ?q=<search>
 *   ?sort=newest|price-asc|price-desc|name
 *   ?page=&perPage=
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page, perPage } = parsePagination(url);
  const q = url.searchParams.get('q')?.trim();

  try {
    // Search has its own reader with a different ranking and no pagination;
    // wrap it in the same envelope so the client sees one shape.
    if (q) {
      const items = await fetchSearchProducts(q);
      return json({
        items: items.map(serializeProduct),
        page: 1,
        perPage: items.length,
        totalItems: items.length,
        totalPages: 1,
      });
    }

    const result = await fetchProducts({
      page,
      limit: perPage,
      category: url.searchParams.get('category') || undefined,
      tag: url.searchParams.get('tag') || undefined,
      minPrice: url.searchParams.get('minPrice') || undefined,
      maxPrice: url.searchParams.get('maxPrice') || undefined,
      inStockOnly: url.searchParams.get('inStock') === 'true',
      sort: parseSort(url.searchParams.get('sort')),
    });

    return json({
      items: result.items.map(serializeProduct),
      page: result.page,
      perPage: result.limit,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
    });
  } catch (error: any) {
    console.error('GET /api/v1/products', error);
    return apiError(500, 'Could not load products');
  }
}
