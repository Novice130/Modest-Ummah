import type { NextRequest } from 'next/server';

/**
 * Split /wp-json/wc/{version}/{...resource} out of the request path.
 *
 * The route handlers read the version and resource from the pathname rather
 * than from Next's params argument, because wooRoute() wraps a single-argument
 * handler so that authentication cannot be skipped by a route that forgets to
 * call it. Parsing here keeps that wrapper uniform.
 */
export function versionFromPath(request: NextRequest): {
  version: string;
  resource: string[];
} {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  // ['wp-json', 'wc', version, ...resource]
  const wcIndex = segments.indexOf('wc');
  if (wcIndex < 0) return { version: '', resource: [] };

  return {
    version: segments[wcIndex + 1] || '',
    resource: segments.slice(wcIndex + 2).map((s) => decodeURIComponent(s)),
  };
}
