import { fetchCategoryTree } from '@/lib/actions/category.actions';
import { json, apiError } from '@/lib/api/v1/http';
import { serializeCategory } from '@/lib/api/v1/serializers';

/** GET /api/v1/categories — the full tree, nested, root-first. */
export async function GET() {
  try {
    const tree = await fetchCategoryTree();
    return json({ items: tree.map(serializeCategory) });
  } catch (error: any) {
    console.error('GET /api/v1/categories', error);
    return apiError(500, 'Could not load categories');
  }
}
