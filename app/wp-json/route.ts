import { NextResponse } from 'next/server';
import { wooRoute } from '@/lib/woo/handler';
import { WP_VERSION } from '@/lib/woo/serialize';
import { storeUrl } from '@/lib/woo/store';

/**
 * WordPress REST discovery index.
 *
 * Clients probe this to confirm they are talking to a WordPress site and to
 * learn which namespaces exist before hitting wc/v3.
 *
 * Anonymous, as it is in WordPress: this is how a client discovers *how* to
 * authenticate, so requiring authentication to read it is circular. Nothing
 * here is customer data — the site name, the namespace list, version strings.
 */
export const GET = wooRoute(async () => {
  const url = storeUrl();
  return NextResponse.json({
    name: 'Modest Ummah',
    description: 'Modest Ummah storefront',
    url,
    home: url,
    gmt_offset: 0,
    timezone_string: 'UTC',
    namespaces: ['oembed/1.0', 'wp/v2', 'wc/v3', 'wc/store/v1'],
    authentication: {},
    routes: {
      '/wc/v3': { namespace: 'wc/v3', methods: ['GET'] },
      '/wc/v3/orders': { namespace: 'wc/v3', methods: ['GET'] },
      '/wc/v3/products': { namespace: 'wc/v3', methods: ['GET'] },
      '/wc/v3/system_status': { namespace: 'wc/v3', methods: ['GET'] },
    },
    _links: { help: [{ href: 'https://developer.wordpress.org/rest-api/' }] },
    wp_version: WP_VERSION,
  });
}, { allowAnonymous: true });
