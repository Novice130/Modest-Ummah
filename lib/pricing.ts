import { getDb } from '@/lib/db';
import { products, productVariants } from '@/lib/schema';
import { inArray } from 'drizzle-orm';
import { getShippingRates, getFreeShippingInfo } from '@/lib/shipping';
import { calculateTax } from '@/lib/taxcloud';
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
  shipping: number;
  tax: number;
  total: number;
  taxEstimate: number;
  shippingService: string;
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

  const rows = await db
    .select()
    .from(products)
    .where(inArray(products.id, productIds));

  const byId = new Map(rows.map((r) => [r.id, r]));

  // Variant prices override the parent price. One query for all variants
  // referenced by this cart.
  const variantIds = [
    ...new Set(items.map((i) => i.variantId).filter(Boolean)),
  ] as string[];
  const variantRows = variantIds.length
    ? await db
        .select()
        .from(productVariants)
        .where(inArray(productVariants.id, variantIds))
    : [];
  const variantById = new Map(variantRows.map((v) => [v.id, v]));

  const resolvedItems: OrderItem[] = [];

  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product) {
      throw new Error('A product in your cart no longer exists');
    }

    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error('Invalid quantity');
    }

    const quantity = Math.min(item.quantity, MAX_QTY);

    let price: number;
    let sku: string | undefined;
    let image: string | undefined = item.image;
    let variantId: string | undefined;

    if (item.variantId) {
      const variant = variantById.get(item.variantId);
      if (!variant || variant.productId !== product.id) {
        throw new Error('A product variant in your cart no longer exists');
      }
      price = variant.price !== null && variant.price !== undefined
        ? parseFloat(variant.price as string)
        : parseFloat(product.price as string);
      sku = variant.sku;
      image = variant.image || item.image;
      variantId = variant.id;
    } else {
      price = parseFloat(product.price as string);
      sku = product.sku || undefined;
    }

    resolvedItems.push({
      productId: product.id,
      variantId,
      name: product.name,
      price: round2(price || 0),
      quantity,
      color: item.color,
      size: item.size,
      image,
      sku,
    });
  }

  const subtotal = round2(
    resolvedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  );

  const address = normalizeShippingAddress(input.shippingAddress);
  if (!address.address1 || !address.city || !address.state || !address.postalCode) {
    throw new Error('Shipping address is incomplete');
  }

  const ratesResult = await getShippingRates({
    destination: {
      name: `${address.firstName || ''} ${address.lastName || ''}`.trim() || 'Customer',
      street1: address.address1,
      street2: address.address2 || '',
      city: address.city,
      state: address.state,
      zip: address.postalCode,
      country: address.country || 'US',
      phone: address.phone,
      email: address.email,
    },
    package: {
      length: 10,
      width: 7,
      height: 1,
      weight: Math.min(
        resolvedItems.reduce((sum, item) => sum + 8 * item.quantity, 0) + 2,
        64
      ),
    },
  });

  const selected =
    ratesResult.rates.find((r) => r.service === input.shippingService) ||
    ratesResult.rates[0];

  const freeShipping = getFreeShippingInfo(subtotal);
  const shipping = freeShipping.eligible
    ? 0
    : round2(selected?.rate ?? 9.99);

  const taxResult = await calculateTax({
    items: resolvedItems.map((item) => {
      const product = byId.get(item.productId)!;
      return {
        id: item.variantId || item.productId,
        price: item.price,
        quantity: item.quantity,
        category: product.category,
        subcategory: product.subcategory,
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
    shipping,
    tax,
    total: round2(subtotal + shipping + tax),
    taxEstimate: tax,
    shippingService: freeShipping.eligible ? 'standard' : (selected?.service || 'standard'),
  };
}
