import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { orderNotes, products } from '@/lib/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { WooErrors } from '@/lib/woo/errors';
import { withPagination } from '@/lib/woo/handler';
import {
  parseListParams,
  listOrders,
  findOrderByWooId,
  productWooIdMap,
} from '@/lib/woo/queries';
import {
  serializeOrder,
  serializeProduct,
  serializeOrderNote,
  wooDates,
  WC_VERSION,
  WP_VERSION,
  STORE_CURRENCY,
  STORE_CURRENCY_SYMBOL,
} from '@/lib/woo/serialize';
import { storeUrl, storeOrigin } from '@/lib/woo/store';
import { applyWriteback } from '@/lib/woo/writeback';

/**
 * WooCommerce endpoint implementations, shared across API versions.
 *
 * WooCommerce still serves wc/v1 and wc/v2 alongside wc/v3 for backwards
 * compatibility, and clients pick whichever they were written against —
 * Pirate Ship probes **wc/v1**. Rather than duplicate every route per version,
 * a single dispatcher serves all three and echoes back whichever namespace was
 * asked for. The payload shapes are close enough across versions that the v3
 * body satisfies v1 and v2 clients; the fields they read (id, status, billing,
 * shipping, line_items, meta_data) are identical.
 */

export const SUPPORTED_VERSIONS = new Set(['v1', 'v2', 'v3']);

export interface Dispatch {
  request: NextRequest;
  version: string;
  /** Path segments after /wp-json/wc/{version}/ */
  resource: string[];
  body: unknown;
}

function parseId(raw: string | undefined): number | null {
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// ─── Namespace index ────────────────────────────────────

export function namespaceIndex(version: string): NextResponse {
  const url = storeUrl();
  const ns = `wc/${version}`;
  const route = (path: string, methods: string[]) => ({
    namespace: ns,
    methods,
    endpoints: [{ methods, args: {} }],
    _links: { self: [{ href: `${url}/wp-json/${ns}${path}` }] },
  });

  return NextResponse.json({
    namespace: ns,
    routes: {
      [`/${ns}`]: route('', ['GET']),
      [`/${ns}/orders`]: route('/orders', ['GET']),
      [`/${ns}/orders/(?P<id>[\\d]+)`]: route('/orders/{id}', ['GET', 'POST', 'PUT', 'PATCH']),
      [`/${ns}/orders/(?P<order_id>[\\d]+)/notes`]: route('/orders/{id}/notes', ['GET', 'POST']),
      [`/${ns}/products`]: route('/products', ['GET']),
      [`/${ns}/products/(?P<id>[\\d]+)`]: route('/products/{id}', ['GET']),
      [`/${ns}/system_status`]: route('/system_status', ['GET']),
      [`/${ns}/settings/general`]: route('/settings/general', ['GET']),
    },
    _links: { self: [{ href: `${url}/wp-json/${ns}` }] },
  });
}

// ─── system_status ──────────────────────────────────────

export function systemStatus(): NextResponse {
  const url = storeUrl();
  const origin = storeOrigin();

  return NextResponse.json({
    environment: {
      home_url: url,
      site_url: url,
      version: WC_VERSION,
      wp_version: WP_VERSION,
      wp_multisite: false,
      wp_memory_limit: 268435456,
      wp_debug_mode: false,
      wp_cron: true,
      language: 'en_US',
      external_object_cache: false,
      server_info: 'Next.js',
      php_version: '8.2.0',
      max_upload_size: 8388608,
      default_timezone: 'UTC',
      fsockopen_or_curl_enabled: true,
      soapclient_enabled: false,
      domdocument_enabled: true,
      gzip_enabled: true,
      mbstring_enabled: true,
      remote_post_successful: true,
      remote_get_successful: true,
    },
    database: { wc_database_version: WC_VERSION, database_prefix: 'wp_' },
    active_plugins: [],
    theme: {
      name: 'Modest Ummah',
      version: '1.1.0',
      is_child_theme: false,
      has_woocommerce_support: true,
      has_woocommerce_file: false,
      has_outdated_templates: false,
    },
    settings: {
      api_enabled: true,
      force_ssl: true,
      currency: STORE_CURRENCY,
      currency_symbol: STORE_CURRENCY_SYMBOL,
      currency_position: 'left',
      thousand_separator: ',',
      decimal_separator: '.',
      number_of_decimals: 2,
      geolocation_enabled: false,
      taxonomies: {},
      product_visibility_terms: {},
      woocommerce_weight_unit: 'oz',
      woocommerce_dimension_unit: 'in',
    },
    security: { secure_connection: true, hide_errors: true },
    store: {
      address: origin.street1,
      address_2: origin.street2,
      city: origin.city,
      state: origin.state,
      postcode: origin.zip,
      country: origin.country,
    },
    pages: [],
    post_type_counts: [],
  });
}

// ─── settings/general ───────────────────────────────────

export function settingsGeneral(): NextResponse {
  const origin = storeOrigin();
  const setting = (id: string, label: string, value: string, type = 'text') => ({
    id,
    label,
    description: '',
    type,
    default: '',
    tip: '',
    value,
  });

  return NextResponse.json([
    setting('woocommerce_store_address', 'Address line 1', origin.street1),
    setting('woocommerce_store_address_2', 'Address line 2', origin.street2),
    setting('woocommerce_store_city', 'City', origin.city),
    setting(
      'woocommerce_default_country',
      'Country / State',
      `${origin.country}:${origin.state}`,
      'select'
    ),
    setting('woocommerce_store_postcode', 'Postcode / ZIP', origin.zip),
    setting('woocommerce_currency', 'Currency', STORE_CURRENCY, 'select'),
    setting('woocommerce_weight_unit', 'Weight unit', 'oz', 'select'),
    setting('woocommerce_dimension_unit', 'Dimensions unit', 'in', 'select'),
  ]);
}

// ─── Orders ─────────────────────────────────────────────

async function ordersList(request: NextRequest): Promise<NextResponse> {
  const params = parseListParams(request.nextUrl.searchParams);
  const { rows, total, totalPages } = await listOrders(params);
  const productWooIds = await productWooIdMap(rows);
  const url = storeUrl();

  return withPagination(
    rows.map((row) => serializeOrder(row, { productWooIds, storeUrl: url })),
    { total, totalPages }
  );
}

async function orderSingle(wooId: number): Promise<NextResponse> {
  const order = await findOrderByWooId(wooId);
  // Unpaid orders do not exist as far as this API is concerned; returning one
  // by direct id would bypass the listing filter.
  if (!order || order.paymentStatus !== 'paid') return WooErrors.invalidOrder();

  const productWooIds = await productWooIdMap([order]);
  return NextResponse.json(
    serializeOrder(order, { productWooIds, storeUrl: storeUrl() })
  );
}

async function orderUpdate(wooId: number, body: unknown): Promise<NextResponse> {
  const order = await findOrderByWooId(wooId);
  if (!order || order.paymentStatus !== 'paid') return WooErrors.invalidOrder();

  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const result = await applyWriteback(order, {
    status: payload.status,
    meta_data: payload.meta_data,
  });

  const productWooIds = await productWooIdMap([result.order]);
  return NextResponse.json(
    serializeOrder(result.order, { productWooIds, storeUrl: storeUrl() })
  );
}

async function notesList(wooId: number): Promise<NextResponse> {
  const order = await findOrderByWooId(wooId);
  if (!order || order.paymentStatus !== 'paid') return WooErrors.invalidOrder();

  const db = getDb();
  const rows = await db
    .select()
    .from(orderNotes)
    .where(eq(orderNotes.orderId, order.id))
    .orderBy(desc(orderNotes.createdAt))
    .limit(100);

  return NextResponse.json(rows.map((row, index) => serializeOrderNote(row, index)));
}

async function notesCreate(wooId: number, body: unknown): Promise<NextResponse> {
  const order = await findOrderByWooId(wooId);
  if (!order || order.paymentStatus !== 'paid') return WooErrors.invalidOrder();

  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const note = typeof payload.note === 'string' ? payload.note.trim() : '';
  if (!note) {
    return WooErrors.invalidParam('note', 'note is required and must be a string');
  }

  const customerNote = payload.customer_note === true || payload.customer_note === 'true';

  const result = await applyWriteback(order, {
    noteText: note,
    customerNote,
    meta_data: payload.meta_data,
  });

  const created = wooDates(new Date());
  return NextResponse.json(
    {
      id: 1,
      author: 'Pirate Ship',
      date_created: created.local,
      date_created_gmt: created.gmt,
      note,
      customer_note: customerNote,
      _order_status: result.order.status,
    },
    { status: 201 }
  );
}

// ─── Products ───────────────────────────────────────────

async function productsList(request: NextRequest): Promise<NextResponse> {
  const params = parseListParams(request.nextUrl.searchParams);
  const db = getDb();

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products);

  const total = countRow?.count ?? 0;
  const totalPages = params.perPage > 0 ? Math.ceil(total / params.perPage) : 0;

  const rows = await db
    .select()
    .from(products)
    .orderBy(desc(products.createdAt))
    .limit(params.perPage)
    .offset((params.page - 1) * params.perPage);

  const url = storeUrl();
  return withPagination(
    rows.map((row) => serializeProduct(row, { storeUrl: url })),
    { total, totalPages }
  );
}

async function productSingle(wooId: number): Promise<NextResponse> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(products)
    .where(eq(products.wooProductId, wooId))
    .limit(1);

  if (!row) return WooErrors.invalidProduct();
  return NextResponse.json(serializeProduct(row, { storeUrl: storeUrl() }));
}

// ─── Dispatcher ─────────────────────────────────────────

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export async function dispatchWoo({
  request,
  version,
  resource,
  body,
}: Dispatch): Promise<NextResponse> {
  if (!SUPPORTED_VERSIONS.has(version)) {
    return WooErrors.noRoute(request.nextUrl.pathname);
  }

  const [head, second, third] = resource;
  const method = request.method;

  // /wc/{version}
  if (!head) return namespaceIndex(version);

  if (head === 'system_status' && !second) return systemStatus();

  if (head === 'settings' && second === 'general') return settingsGeneral();

  if (head === 'orders') {
    if (!second) {
      if (method === 'GET') return ordersList(request);
      return WooErrors.noRoute(request.nextUrl.pathname);
    }

    const orderId = parseId(second);
    if (orderId === null) return WooErrors.invalidOrder();

    if (third === 'notes') {
      if (method === 'GET') return notesList(orderId);
      if (method === 'POST') return notesCreate(orderId, body);
      return WooErrors.noRoute(request.nextUrl.pathname);
    }

    if (!third) {
      if (method === 'GET') return orderSingle(orderId);
      if (WRITE_METHODS.has(method)) return orderUpdate(orderId, body);
    }

    return WooErrors.noRoute(request.nextUrl.pathname);
  }

  if (head === 'products') {
    if (!second) {
      if (method === 'GET') return productsList(request);
      return WooErrors.noRoute(request.nextUrl.pathname);
    }
    const productId = parseId(second);
    if (productId === null) return WooErrors.invalidProduct();
    if (method === 'GET') return productSingle(productId);
    return WooErrors.noRoute(request.nextUrl.pathname);
  }

  return WooErrors.noRoute(request.nextUrl.pathname);
}
