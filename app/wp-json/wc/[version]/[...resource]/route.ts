import { wooRoute } from '@/lib/woo/handler';
import { dispatchWoo } from '@/lib/woo/endpoints';
import { versionFromPath } from '@/lib/woo/path';

/**
 * Every /wp-json/wc/{version}/... endpoint, for wc/v1, wc/v2 and wc/v3.
 *
 * One dispatcher rather than a route file per resource per version: Pirate
 * Ship calls wc/v1, other Woo clients call v2 or v3, and the payloads they
 * read are identical across all three.
 */
const handle = wooRoute(async ({ request, body }) => {
  const { version, resource } = versionFromPath(request);
  return dispatchWoo({ request, version, resource, body });
});

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
