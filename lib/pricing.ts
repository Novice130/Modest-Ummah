import { getDb } from '@/lib/db';
import { categories, products, productVariants } from '@/lib/schema';
import { getTableColumns, inArray, sql } from 'drizzle-orm';
import { getShippingRates, getFreeShippingInfo } from '@/lib/shipping';
import { computeParcelFromWeights, DEFAULT_ITEM_WEIGHT_OZ } from '@/lib/parcel';
import { toCarrierAddress } from '@/lib/address';
import { calculateTax } from '@/lib/taxcloud';
import { evaluateCoupon } from '@/lib/coupons';
import { liveCondition } from '@/lib/product-live';
import { findVariantByOptions, variantOptions } from '@/lib/variant-options';
import type { OrderItem, ShippingAddressDB } from '@/lib/schema';

export const MAX_QTY = 99;

export interface CheckoutItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
  color?: string;
  size?: string;
  image?: string;
}

export interface ResolvedOrder {
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  taxEstimate: number;
  shippingService: string;
  couponCode: string | null;
}

/**
 * A cart line the shopper has to change: the product is not for sale or the
 * picked options are not a real variant. The checkout route answers 409 with
 * this message instead of a 500.
 */
export class CheckoutRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutRejectedError';
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizeShippingAddress(raw: unknown): ShippingAddressDB {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {} as ShippingAddressDB;
    }
  }
  return (raw || {}) as ShippingAddressDB;
}

/**
 * Server-side price resolution for checkout. Ignores every client-supplied
 * price, shipping amount, and tax amount. Prices come from the database.
 * Shipping is recomputed via lib/shipping.ts (Pirate Ship rates with the
 * free-shipping threshold from getFreeShippingInfo). Tax is recomputed via
 * lib/taxcloud.ts. This is the single authoritative total charged to Stripe.
 */
export async function resolveCheckoutOrder(input: {
  items: CheckoutItemInput[];
  shippingAddress: unknown;
  shippingService?: string | null;
  couponCode?: string | null;
}): Promise<ResolvedOrder> {
  const db = getDb();

  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) {
    throw new Error('Cart is empty');
  }

  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  if (productIds.length === 0) {
    throw new Error('Cart items are missing product IDs');
  }

  // isLive is the storefront's own rule, evaluated by the database so a due
  // scheduled product stays buyable and a draft does not.
  const rows = await db
    .select({ ...getTableColumns(products), isLive: sql<boolean>`${liveCondition()}` })
    .from(products)
    .where(inArray(products.id, productIds));

  const byId = new Map(rows.map((r) => [r.id, r]));

  // Coupon eligibility and the tax lookup both key off category SLUG, while
  // the product row carries a uuid FK. Resolve once for the whole cart.
  const categoryRows = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories);
  const categorySlug = new Map(categoryRows.map((c) => [c.id, c.slug]));
  const slugFor = (productId: string) => {
    const id = byId.get(productId)?.categoryId;
    return id ? categorySlug.get(id) ?? '' : '';
  };

  // Variant prices override the parent price. One query for every variant of
  // the products in this cart: a line may name its variant by id or by options.
  const variantRows = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.productId, productIds));
  const variantById = new Map(variantRows.map((v) => [v.id, v]));

  const resolvedItems: OrderItem[] = [];

  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product) {
      throw new Error('A product in your cart no longer exists');
    }

    if (product.isLive !== true) {
      throw new CheckoutRejectedError(`${product.name} is not available for purchase`);
    }

    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error('Invalid quantity');
    }

    const quantity = Math.min(item.quantity, MAX_QTY);

    let price: number;
    let sku: string | undefined;
    let image: string | undefined = item.image;

    // A line that names options but no id (a cart saved before the picker sent
    // ids) is resolved to its variant. A line with neither stays at the parent
    // price: the mobile app has no variant picker and sends only product id and
    // quantity, so rejecting it would stop mobile sales of variable products.
    let variant: (typeof variantRows)[number] | undefined;
    if (item.variantId) {
      variant = variantById.get(item.variantId);
      if (!variant || variant.productId !== product.id) {
        throw new Error('A product variant in your cart no longer exists');
      }
    } else if (product.productType === 'variable' && (item.size || item.color)) {
      const siblings = variantRows.filter((v) => v.productId === product.id);
      if (siblings.length > 0) {
        variant = findVariantByOptions(siblings, item);
        if (!variant) {
          throw new CheckoutRejectedError(
            `The selected options for ${product.name} are no longer available`
          );
        }
      }
    }

    // What ships is the variant that was priced, so its own Size/Color go on
    // the order rather than the labels the client sent.
    const options = variantOptions(variant?.attributes);

    if (variant) {
      price = variant.price !== null && variant.price !== undefined
        ? parseFloat(variant.price as string)
        : parseFloat(product.price as string);
      sku = variant.sku;
      image = variant.image || item.image;
    } else {
      price = parseFloat(product.price as string);
      sku = product.sku || undefined;
    }

    // Snapshot the per-unit weight onto the line item so the order still
    // reports what it was priced and shipped at after the product is edited.
    const rawWeight = variant?.weight ?? product.weight;
    const parsedWeight = rawWeight != null ? parseFloat(rawWeight as string) : NaN;
    const weightOz = Number.isFinite(parsedWeight) && parsedWeight > 0
      ? parsedWeight
      : DEFAULT_ITEM_WEIGHT_OZ;

    resolvedItems.push({
      productId: product.id,
      variantId: variant?.id,
      name: product.name,
      price: round2(price || 0),
      quantity,
      color: options.color ?? item.color,
      size: options.size ?? item.size,
      image,
      sku,
      weightOz,
    });
  }

  const subtotal = round2(
    resolvedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  );

  // Coupon validation against the DB row: enabled, window, usage limit,
  // min spend, and product/category eligibility. Discount comes from the
  // resolved line items only — client-supplied discount values are ignored.
  const coupon = await evaluateCoupon(
    input.couponCode,
    subtotal,
    resolvedItems.map((item) => ({
      productId: item.productId,
      category: slugFor(item.productId),
      price: item.price,
      quantity: item.quantity,
    }))
  );
  if (!coupon.ok) {
    throw new Error(coupon.error || 'Invalid coupon');
  }
  const discount = round2(coupon.discount || 0);
  const taxableSubtotal = Math.max(0, subtotal - discount);

  const address = normalizeShippingAddress(input.shippingAddress);
  if (!address.address1 || !address.city || !address.state || !address.postalCode) {
    throw new Error('Shipping address is incomplete');
  }

  // Real weights from the snapshots taken above, via the shared calculator.
  // Previously this hardcoded 8 oz/item and a 10x7x1 box while the client's
  // /api/shipping/rates call used a different box, so the quote shown and the
  // amount charged could diverge.
  const parcel = computeParcelFromWeights(resolvedItems);

  const ratesResult = await getShippingRates({
    destination: toCarrierAddress(address),
    package: parcel,
  });

  const selected =
    ratesResult.rates.find((r) => r.service === input.shippingService) ||
    ratesResult.rates[0];

  const freeShipping = getFreeShippingInfo(taxableSubtotal);
  const shipping = freeShipping.eligible
    ? 0
    : round2(selected?.rate ?? 9.99);

  const taxResult = await calculateTax({
    items: resolvedItems.map((item) => {
      const product = byId.get(item.productId)!;
      return {
        id: item.variantId || item.productId,
        // Discount spread proportionally across line items so the tax
        // lookup uses the true taxable price of each item.
        price: subtotal > 0 ? round2(item.price * (taxableSubtotal / subtotal)) : item.price,
        quantity: item.quantity,
        category: slugFor(product.id),
      };
    }),
    shippingAddress: {
      address1: address.address1,
      address2: address.address2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
    },
  });

  const tax = round2(taxResult.totalTax || 0);

  return {
    items: resolvedItems,
    subtotal,
    discount,
    shipping,
    tax,
    total: round2(taxableSubtotal + shipping + tax),
    taxEstimate: tax,
    shippingService: freeShipping.eligible ? 'standard' : (selected?.service || 'standard'),
    couponCode: coupon.couponCode || null,
  };
}
