import { fetchTags } from '@/lib/actions/tag.actions';
import { json, apiError } from '@/lib/api/v1/http';

/** GET /api/v1/tags */
export async function GET() {
  try {
    return json({ items: await fetchTags() });
  } catch (error: any) {
    console.error('GET /api/v1/tags', error);
    return apiError(500, 'Could not load tags');
  }
}
