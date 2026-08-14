import { wooRoute } from '@/lib/woo/handler';
import { WooErrors } from '@/lib/woo/errors';

/**
 * Catch-all for every /wp-json path we have not implemented.
 *
 * Pirate Ship's exact call sequence is not published anywhere. Rather than
 * guess at it, this records each unmatched request to integration_events and
 * answers with WordPress's own rest_no_route error. After connecting the
 * integration, the 404 rows in that table are the list of endpoints still to
 * build — the real spec, written by the client itself:
 *
 *   SELECT method, path, count(*)
 *   FROM integration_events
 *   WHERE status_code = 404
 *   GROUP BY method, path
 *   ORDER BY count(*) DESC;
 *
 * More specific route files take precedence over this one, so implementing an
 * endpoint automatically removes it from the log.
 */
const notFound = wooRoute(async ({ request }) =>
  WooErrors.noRoute(request.nextUrl.pathname)
);

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
