/**
 * The purchase test must never buy on production. Shared by playwright.config.ts
 * (refuses at load) and the spec (blocks stray requests at run time).
 */
const PRODUCTION_HOSTS = new Set(['modestummah.com', 'www.modestummah.com']);

/** True for the production hosts. new URL() lowercases; a trailing dot is the same host. */
export function isProductionUrl(url: string | URL): boolean {
  const { hostname } = typeof url === 'string' ? new URL(url) : url;
  return PRODUCTION_HOSTS.has(hostname.replace(/\.+$/, ''));
}

export function assertNotProduction(baseUrl: string): void {
  if (isProductionUrl(baseUrl)) {
    throw new Error(
      `Refusing to run: E2E_BASE_URL (${baseUrl}) is production. This test places a real order; point it at staging.`
    );
  }
}
