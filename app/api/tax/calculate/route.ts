import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { categories, products, productVariants } from '@/lib/schema';
import { calculateTax } from '@/lib/taxcloud';
import { rateLimitRoute } from '@/lib/rate-limit-guards';

/**
 * Tax estimate for the checkout form.
 *
 * Unauthenticated because guest checkout needs it, but it trusts the caller
 * for nothing that reaches TaxCloud except the address: prices and categories
 * come from the database by product/variant id, the cart id is generated
 * here, and the customer id is the library's anonymous default. Items are
 * capped and requests rate limited so this cannot drive unbounded calls to
 * TaxCloud.
 *
 * The authoritative tax is still computed independently in
 * resolveCheckoutOrder(); this endpoint only feeds the on-screen estimate.
 */

const MAX_ITEMS = 50;

const str = (max: number) => z.string().trim().max(max);

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.guid(),
        variantId: z.guid().optional().nullable(),
        quantity: z.number().int().min(1).max(99),
      })
    )
    .min(1)
    .max(MAX_ITEMS),
  shippingAddress: z
    .object({
      address1: str(200).min(1),
      address2: str(200).optional().nullable(),
      city: str(100).min(1),
      state: str(50).min(1),
      postalCode: str(20).optional(),
      zip: str(20).optional(),
    })
    .refine((a) => !!(a.postalCode || a.zip), { message: 'postalCode is required' }),
});

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimitRoute(request, 'taxQuote');
    if (limited) return limited;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Missing or invalid fields: items and shippingAddress' },
        { status: 400 }
      );
    }
    const { items, shippingAddress } = parsed.data;

    // Prices and categories come from the DB, never from the request body.
    const db = getDb();
    const productIds = [...new Set(items.map((i) => i.productId))];
    const rows = await db
      .select({ id: products.id, price: products.price, categoryId: products.categoryId })
      .from(products)
      .where(inArray(products.id, productIds));
    const byId = new Map(rows.map((r) => [r.id, r]));

    const variantRows = await db
      .select({ id: productVariants.id, productId: productVariants.productId, price: productVariants.price })
      .from(productVariants)
      .where(inArray(productVariants.productId, productIds));
    const variantById = new Map(variantRows.map((v) => [v.id, v]));

    const categoryRows = await db
      .select({ id: categories.id, slug: categories.slug })
      .from(categories);
    const categorySlug = new Map(categoryRows.map((c) => [c.id, c.slug]));

    const taxItems = items.flatMap((item) => {
      const product = byId.get(item.productId);
      if (!product) return [];
      const variant = item.variantId ? variantById.get(item.variantId) : undefined;
      const usable = variant && variant.productId === product.id ? variant : undefined;
      const rawPrice =
        usable && usable.price !== null && usable.price !== undefined
          ? usable.price
          : product.price;
      const price = parseFloat(rawPrice as string);
      return [{
        id: usable?.id || product.id,
        price: Number.isFinite(price) ? Math.round(price * 100) / 100 : 0,
        quantity: item.quantity,
        category: product.categoryId ? categorySlug.get(product.categoryId) ?? '' : '',
      }];
    });

    if (taxItems.length === 0) {
      return NextResponse.json(
        { error: 'No valid items to calculate tax for' },
        { status: 400 }
      );
    }

    const result = await calculateTax({
      items: taxItems,
      shippingAddress: {
        address1: shippingAddress.address1,
        address2: shippingAddress.address2 || undefined,
        city: shippingAddress.city,
        state: shippingAddress.state,
        postalCode: (shippingAddress.postalCode || shippingAddress.zip)!,
      },
      // No customerId: calculateTax uses its anonymous 'guest' default.
      cartId: randomUUID(),
    });

    return NextResponse.json({
      success: result.success,
      totalTax: result.totalTax,
      itemTaxes: result.itemTaxes,
      ...(result.success ? {} : { error: 'Tax service unavailable; estimate shown' }),
    });
  } catch (error) {
    console.error('Tax calculation error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate tax' },
      { status: 500 }
    );
  }
}
