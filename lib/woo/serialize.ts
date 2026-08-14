import type { OrderSelect, ProductSelect, OrderItem } from '@/lib/schema';
import { toWooAddress } from '@/lib/address';

/**
 * Our rows → WooCommerce REST API v3 JSON.
 *
 * Two format rules matter more than they look:
 *
 *  1. Dates are *naive* local ISO — "2026-08-14T10:00:00", no Z and no offset.
 *     The paired _gmt field carries UTC, also naive. Emitting a trailing Z is
 *     the single most common way a Woo-compatible payload gets misparsed.
 *  2. Every monetary value is a *string*. Convenient here: Drizzle already
 *     returns numeric columns as strings.
 */

/** Reported WooCommerce version. Pirate Ship requires >= 3.5. */
export const WC_VERSION = '9.4.3';
/** Reported WordPress version. Pirate Ship requires >= 4.4. */
export const WP_VERSION = '6.7.1';

export const STORE_CURRENCY = 'USD';
export const STORE_CURRENCY_SYMBOL = '$';

// ─── Date formatting ────────────────────────────────────

/** WooCommerce's naive ISO-8601: no timezone designator. */
function naiveIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '');
}

/**
 * Timestamps are stored without a timezone and written as UTC, so local and
 * GMT are the same instant here. Both fields are emitted because clients read
 * one or the other and a missing key reads as null.
 */
export function wooDates(date: Date | null | undefined): {
  local: string | null;
  gmt: string | null;
} {
  if (!date) return { local: null, gmt: null };
  const iso = naiveIso(date);
  return { local: iso, gmt: iso };
}

// ─── Money formatting ───────────────────────────────────

export function money(value: unknown): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? 0));
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

// ─── Status mapping ─────────────────────────────────────

export type WooOrderStatus =
  | 'pending'
  | 'processing'
  | 'on-hold'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'failed';

export function toWooStatus(order: {
  status: string;
  paymentStatus: string;
}): WooOrderStatus {
  // Payment state wins where it contradicts fulfilment state: a refunded
  // order must never present as importable work.
  if (order.paymentStatus === 'refunded') return 'refunded';
  if (order.paymentStatus === 'failed') return 'failed';

  switch (order.status) {
    case 'pending':
    case 'pending_payment':
      return 'pending';
    case 'processing':
      return 'processing';
    case 'shipped':
    case 'delivered':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

/** Inbound: a Woo status from a writeback → our order_status enum. */
export function fromWooStatus(status: string): string | null {
  switch (status) {
    case 'completed':
      return 'shipped';
    case 'cancelled':
      return 'cancelled';
    case 'processing':
      return 'processing';
    case 'pending':
    case 'on-hold':
      return 'pending';
    // 'refunded' and 'failed' are owned by the Stripe webhook. Accept the
    // call, change nothing.
    default:
      return null;
  }
}

// ─── Line items ─────────────────────────────────────────

interface LineItemContext {
  /** productId (uuid) → wooProductId (int), for product_id dereferencing. */
  productWooIds?: Map<string, number>;
}

function serializeLineItem(
  item: OrderItem,
  index: number,
  ctx: LineItemContext
): Record<string, unknown> {
  const quantity = item.quantity || 0;
  const lineTotal = (item.price || 0) * quantity;

  // We have no variant *objects* in Woo's sense; surface the chosen options as
  // meta so they print on the packing slip.
  const meta: Array<Record<string, unknown>> = [];
  if (item.color) {
    meta.push({ id: index * 10 + 1, key: 'Color', value: item.color, display_key: 'Color', display_value: item.color });
  }
  if (item.size) {
    meta.push({ id: index * 10 + 2, key: 'Size', value: item.size, display_key: 'Size', display_value: item.size });
  }
  if (item.weightOz != null) {
    meta.push({ id: index * 10 + 3, key: '_weight_oz', value: String(item.weightOz), display_key: '_weight_oz', display_value: String(item.weightOz) });
  }

  return {
    id: index + 1,
    name: item.name || '',
    product_id: (item.productId && ctx.productWooIds?.get(item.productId)) || 0,
    variation_id: 0,
    quantity,
    tax_class: '',
    subtotal: money(lineTotal),
    subtotal_tax: '0.00',
    total: money(lineTotal),
    total_tax: '0.00',
    taxes: [],
    meta_data: meta,
    sku: item.sku || '',
    price: item.price || 0,
    image: item.image ? { id: 0, src: item.image } : {},
    parent_name: null,
  };
}

// ─── Orders ─────────────────────────────────────────────

export interface SerializeOrderOptions extends LineItemContext {
  storeUrl?: string;
}

export function serializeOrder(
  order: OrderSelect,
  options: SerializeOrderOptions = {}
): Record<string, unknown> {
  const items = Array.isArray(order.items) ? order.items : [];
  const created = wooDates(order.createdAt);
  const modified = wooDates(order.updatedAt);

  // Woo sets date_paid when payment completes. We have no dedicated column;
  // for a paid order, creation is the closest honest instant we hold.
  const paid = order.paymentStatus === 'paid' ? created : { local: null, gmt: null };
  const completed = wooDates(order.shippedAt);

  const discount = money(order.discount);
  const status = toWooStatus(order);

  const couponLines = order.couponCode
    ? [
        {
          id: 1,
          code: order.couponCode.toLowerCase(),
          discount,
          discount_tax: '0.00',
          meta_data: [],
        },
      ]
    : [];

  const shippingLines = [
    {
      id: 1,
      method_title: order.shippingService || 'Shipping',
      method_id: order.shippingService || 'flat_rate',
      instance_id: '0',
      total: money(order.shipping),
      total_tax: '0.00',
      taxes: [],
      meta_data: [],
    },
  ];

  // Fulfilment state is exposed as meta_data so a round-trip is idempotent:
  // Pirate Ship can see a tracking number it already wrote.
  const metaData: Array<Record<string, unknown>> = [];
  if (order.trackingNumber) {
    metaData.push({ id: 1, key: '_tracking_number', value: order.trackingNumber });
  }
  if (order.trackingCarrier) {
    metaData.push({ id: 2, key: '_tracking_provider', value: order.trackingCarrier });
  }

  return {
    id: order.wooId,
    parent_id: 0,
    number: order.orderId,
    order_key: `wc_order_${order.id.replace(/-/g, '').slice(0, 13)}`,
    created_via: 'checkout',
    version: WC_VERSION,
    status,
    currency: STORE_CURRENCY,
    date_created: created.local,
    date_created_gmt: created.gmt,
    date_modified: modified.local,
    date_modified_gmt: modified.gmt,
    discount_total: discount,
    discount_tax: '0.00',
    shipping_total: money(order.shipping),
    shipping_tax: '0.00',
    cart_tax: money(order.tax),
    total: money(order.total),
    total_tax: money(order.tax),
    prices_include_tax: false,
    customer_id: 0,
    customer_ip_address: '',
    customer_user_agent: '',
    customer_note: '',
    billing: toWooAddress(order.billingAddress || order.shippingAddress, {
      includeContact: true,
      email: order.email,
    }),
    shipping: toWooAddress(order.shippingAddress),
    payment_method: 'stripe',
    payment_method_title: 'Credit Card (Stripe)',
    transaction_id: order.paymentIntentId || '',
    date_paid: paid.local,
    date_paid_gmt: paid.gmt,
    date_completed: completed.local,
    date_completed_gmt: completed.gmt,
    cart_hash: '',
    meta_data: metaData,
    line_items: items.map((item, index) =>
      serializeLineItem(item, index, { productWooIds: options.productWooIds })
    ),
    tax_lines: [],
    shipping_lines: shippingLines,
    fee_lines: [],
    coupon_lines: couponLines,
    refunds: [],
    payment_url: '',
    is_editable: status === 'pending',
    needs_payment: status === 'pending',
    needs_processing: true,
    currency_symbol: STORE_CURRENCY_SYMBOL,
    _links: options.storeUrl
      ? {
          self: [{ href: `${options.storeUrl}/wp-json/wc/v3/orders/${order.wooId}` }],
          collection: [{ href: `${options.storeUrl}/wp-json/wc/v3/orders` }],
        }
      : {},
  };
}

// ─── Products ───────────────────────────────────────────

export function serializeProduct(
  product: ProductSelect,
  options: { storeUrl?: string } = {}
): Record<string, unknown> {
  const created = wooDates(product.createdAt);
  const modified = wooDates(product.updatedAt);

  const dimension = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const n = parseFloat(String(value));
    return Number.isFinite(n) && n > 0 ? String(n) : '';
  };

  // WooCommerce reports weight in the store's configured unit. We store and
  // report ounces; system_status advertises 'oz' so the two agree.
  const weight = dimension(product.weight);

  return {
    id: product.wooProductId,
    name: product.name,
    slug: product.slug,
    permalink: options.storeUrl ? `${options.storeUrl}/products/${product.slug}` : '',
    date_created: created.local,
    date_created_gmt: created.gmt,
    date_modified: modified.local,
    date_modified_gmt: modified.gmt,
    type: product.productType === 'variable' ? 'variable' : 'simple',
    status: product.status === 'published' ? 'publish' : 'draft',
    featured: Boolean(product.featured),
    catalog_visibility: product.visibility === 'public' ? 'visible' : 'hidden',
    description: product.description || '',
    short_description: product.shortDescription || '',
    sku: product.sku || '',
    price: money(product.price),
    regular_price: money(product.price),
    sale_price: product.compareAtPrice ? money(product.price) : '',
    on_sale: Boolean(product.compareAtPrice),
    purchasable: true,
    virtual: false,
    downloadable: false,
    tax_status: 'taxable',
    tax_class: product.taxClass || '',
    manage_stock: Boolean(product.manageStock),
    stock_quantity: product.stockQuantity ?? 0,
    stock_status: product.inStock ? 'instock' : 'outofstock',
    backorders: product.backorderPolicy || 'no',
    // The fields Pirate Ship actually reads to size a parcel.
    weight,
    dimensions: {
      length: dimension(product.lengthIn),
      width: dimension(product.widthIn),
      height: dimension(product.heightIn),
    },
    shipping_required: true,
    shipping_taxable: true,
    shipping_class: product.shippingClass || '',
    shipping_class_id: 0,
    reviews_allowed: false,
    average_rating: '0.00',
    rating_count: 0,
    categories: product.category
      ? [{ id: 0, name: product.category, slug: product.category }]
      : [],
    tags: (product.tags || []).map((tag, i) => ({ id: i + 1, name: tag, slug: tag })),
    images: (product.images || []).map((src, i) => ({
      id: i + 1,
      src,
      name: '',
      alt: (product.imageAlts as Record<string, string> | null)?.[src] || '',
    })),
    attributes: [],
    variations: [],
    meta_data: [],
    _links: options.storeUrl
      ? {
          self: [{ href: `${options.storeUrl}/wp-json/wc/v3/products/${product.wooProductId}` }],
          collection: [{ href: `${options.storeUrl}/wp-json/wc/v3/products` }],
        }
      : {},
  };
}

// ─── Order notes ────────────────────────────────────────

export function serializeOrderNote(note: {
  id: string;
  note: string;
  customerNote: boolean;
  author: string;
  createdAt: Date;
}, index: number): Record<string, unknown> {
  const created = wooDates(note.createdAt);
  return {
    id: index + 1,
    author: note.author,
    date_created: created.local,
    date_created_gmt: created.gmt,
    note: note.note,
    customer_note: note.customerNote,
  };
}
