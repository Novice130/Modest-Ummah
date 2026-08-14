import { NextResponse } from 'next/server';

/**
 * WooCommerce REST error envelope.
 *
 * Clients branch on `code`, not on the HTTP status alone — the official
 * @woocommerce/woocommerce-rest-api client surfaces `error.response.data.code`
 * and integrations key their retry/abort logic off it. A bare
 * `{ error: "..." }` body reads as a malformed response.
 */
export interface WooError {
  code: string;
  message: string;
  data: { status: number; [key: string]: unknown };
}

export function wooError(
  code: string,
  message: string,
  status: number,
  extra: Record<string, unknown> = {}
): NextResponse<WooError> {
  return NextResponse.json(
    { code, message, data: { status, ...extra } },
    { status }
  );
}

export const WooErrors = {
  /**
   * Deliberately identical for "no credentials", "unknown key", "wrong
   * secret", and "revoked key" — distinguishing them would let an attacker
   * enumerate valid consumer keys.
   */
  unauthorized: () =>
    wooError(
      'woocommerce_rest_authentication_error',
      'Consumer key is invalid.',
      401
    ),

  forbiddenWrite: () =>
    wooError(
      'woocommerce_rest_cannot_edit',
      'Sorry, you are not allowed to edit this resource.',
      403
    ),

  insecure: () =>
    wooError(
      'woocommerce_rest_authentication_error',
      'The WooCommerce REST API requires a secure connection (HTTPS).',
      401
    ),

  rateLimited: () =>
    wooError(
      'woocommerce_rest_authentication_error',
      'Too many failed authentication attempts. Try again later.',
      429
    ),

  disabled: () =>
    wooError('rest_no_route', 'No route was found matching the URL and request method.', 404),

  noRoute: (path: string) =>
    wooError(
      'rest_no_route',
      'No route was found matching the URL and request method.',
      404,
      { path }
    ),

  invalidOrder: () =>
    wooError('woocommerce_rest_invalid_order_id', 'Invalid order ID.', 404),

  invalidProduct: () =>
    wooError('woocommerce_rest_product_invalid_id', 'Invalid ID.', 404),

  invalidParam: (param: string, reason: string) =>
    wooError('rest_invalid_param', `Invalid parameter(s): ${param}`, 400, {
      params: { [param]: reason },
    }),

  serverError: (message = 'Internal server error.') =>
    wooError('woocommerce_rest_server_error', message, 500),
};
