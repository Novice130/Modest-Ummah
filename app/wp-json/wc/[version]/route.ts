import { wooRoute } from '@/lib/woo/handler';
import { dispatchWoo } from '@/lib/woo/endpoints';
import { versionFromPath } from '@/lib/woo/path';

/**
 * /wp-json/wc/{version} — namespace index for wc/v1, wc/v2 and wc/v3.
 *
 * Pirate Ship probes wc/v1, so the version is dynamic and echoed back rather
 * than hardcoded to v3.
 *
 * Anonymous, matching WP_REST_Server::get_namespace_index, which has no
 * permission callback. This is the request Pirate Ship's connection check
 * makes, and it makes it with no credentials — answering 401 here is what it
 * reports back to the merchant as "couldn't connect with your saved
 * credentials". The response is a route listing; it carries no order data.
 */
export const GET = wooRoute(
  async ({ request }) =>
    dispatchWoo({
      request,
      version: versionFromPath(request).version,
      resource: [],
      body: null,
    }),
  { allowAnonymous: true }
);
