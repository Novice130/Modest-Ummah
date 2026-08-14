/**
 * WooCommerce's key-exchange endpoint, /wc-auth/v1/authorize.
 *
 * Pirate Ship does not ask the merchant to paste a consumer key and secret —
 * it sends the browser here, expects a human to approve, and expects the store
 * to POST a freshly minted credential pair to its callback URL. This module
 * holds the parameter validation and the safety rules; the UI lives in
 * app/wc-auth/v1/authorize/, the mint-and-deliver step in
 * lib/actions/woo-auth.actions.ts.
 *
 * Reference: WooCommerce's includes/class-wc-auth.php.
 *
 * THREAT MODEL. This endpoint mints a read_write credential to customer PII
 * and posts it to a URL supplied in the query string. The parameters are
 * attacker-controllable: anyone can send a logged-in admin a link to
 * /wc-auth/v1/authorize?…&callback_url=https://attacker.example. Three things
 * stand in the way, and all three matter:
 *
 *   1. An admin session is required — checked when rendering and again in the
 *      action, never inferred from the request.
 *   2. Approval is an explicit human click, and the screen names the app and
 *      the exact host that will receive the credentials.
 *   3. Both URLs must be HTTPS and must belong to an allowlisted host. Woo
 *      itself only enforces the SSL half; the allowlist is ours, because a
 *      store that integrates one shipping vendor has no reason to hand keys to
 *      an arbitrary domain.
 */

export type WooAuthScope = 'read' | 'write' | 'read_write';

export interface WooAuthRequest {
  appName: string;
  scope: WooAuthScope;
  userId: string;
  returnUrl: string;
  callbackUrl: string;
}

export type WooAuthValidation =
  | { ok: true; request: WooAuthRequest }
  | { ok: false; error: string };

/**
 * Hosts allowed to receive credentials, as suffixes. Override with
 * WOO_AUTH_CALLBACK_HOSTS (comma-separated) to authorize another integration.
 */
function allowedHosts(): string[] {
  const configured = process.env.WOO_AUTH_CALLBACK_HOSTS;
  if (configured) {
    return configured
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
  }
  return ['pirateship.com'];
}

export function isAllowedHost(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  const host = url.hostname.toLowerCase();
  return allowedHosts().some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** Host shown on the consent screen, so the admin approves a name they can check. */
export function hostOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return rawUrl;
  }
}

export function validateWooAuthRequest(
  params: Record<string, string | string[] | undefined>
): WooAuthValidation {
  const read = (key: string): string => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() || '';
  };

  const appName = read('app_name');
  const scope = read('scope') as WooAuthScope;
  const userId = read('user_id');
  const returnUrl = read('return_url');
  const callbackUrl = read('callback_url');

  if (!appName || !scope || !userId || !returnUrl || !callbackUrl) {
    return { ok: false, error: 'Missing app_name, scope, user_id, return_url or callback_url.' };
  }
  if (!['read', 'write', 'read_write'].includes(scope)) {
    return { ok: false, error: `Unknown scope "${scope}".` };
  }
  // WooCommerce refuses a plaintext callback outright; credentials are the
  // entire payload of that request.
  if (!callbackUrl.toLowerCase().startsWith('https://')) {
    return { ok: false, error: 'The callback_url must be served over HTTPS.' };
  }
  if (!isAllowedHost(callbackUrl)) {
    return {
      ok: false,
      error: `This store does not deliver credentials to ${hostOf(callbackUrl)}. ` +
        'Set WOO_AUTH_CALLBACK_HOSTS if this integration is expected.',
    };
  }
  if (!isAllowedHost(returnUrl)) {
    return { ok: false, error: `Refusing to redirect to ${hostOf(returnUrl)}.` };
  }

  return {
    ok: true,
    request: {
      appName: appName.slice(0, 120),
      scope,
      userId: userId.slice(0, 200),
      returnUrl,
      callbackUrl,
    },
  };
}

/** WooCommerce's enum is read|write|read_write; ours has no write-only tier. */
export function permissionsForScope(scope: WooAuthScope): 'read' | 'read_write' {
  return scope === 'read' ? 'read' : 'read_write';
}

/** Woo appends success and user_id to the return URL, and clients read them. */
export function buildReturnUrl(returnUrl: string, userId: string, success: boolean): string {
  const url = new URL(returnUrl);
  url.searchParams.set('success', success ? '1' : '0');
  url.searchParams.set('user_id', userId);
  return url.toString();
}
