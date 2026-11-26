/**
 * The public origin, with no trailing slash. Absolute links are built from this
 * and never from the request's Host header, which the caller controls.
 */
export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://modestummah.com').replace(/\/+$/, '');
}
