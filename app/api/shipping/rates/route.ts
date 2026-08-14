import { NextRequest, NextResponse } from 'next/server';
import { getShippingRates } from '@/lib/shipping';
import { computeParcel } from '@/lib/parcel';
import { toCarrierAddress, isShippable } from '@/lib/address';

/**
 * Shipping rate quotes for the checkout form.
 *
 * Stays unauthenticated because guest checkout needs it, but it no longer
 * trusts the caller for anything that moves money:
 *
 *  - Parcel weight is resolved from the database by product/variant id. It
 *    used to come straight off the request body, so a client could quote
 *    itself a lighter, cheaper parcel by sending weight: 0.
 *  - The item count and body size are capped, so this cannot be used to drive
 *    unbounded work against the carrier API.
 *
 * The authoritative charge is still computed independently in
 * resolveCheckoutOrder(); this endpoint only feeds the on-screen estimate.
 */

const MAX_ITEMS = 50;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, shippingAddress } = body ?? {};

    if (!Array.isArray(items) || items.length === 0 || !shippingAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: items and shippingAddress' },
        { status: 400 }
      );
    }

    if (items.length > MAX_ITEMS) {
      return NextResponse.json(
        { error: 'Too many items in one request' },
        { status: 400 }
      );
    }

    if (!isShippable(shippingAddress)) {
      return NextResponse.json(
        { error: 'Shipping address is incomplete' },
        { status: 400 }
      );
    }

    // Weights come from the DB, never from the request body.
    const parcel = await computeParcel(
      items.map((item: any) => ({
        productId: typeof item?.productId === 'string' ? item.productId : undefined,
        variantId: typeof item?.variantId === 'string' ? item.variantId : undefined,
        quantity:
          Number.isInteger(item?.quantity) && item.quantity > 0
            ? Math.min(item.quantity, 99)
            : 1,
      }))
    );

    const result = await getShippingRates({
      destination: toCarrierAddress(shippingAddress),
      package: parcel,
    });

    return NextResponse.json({
      success: result.success,
      rates: result.rates,
      error: result.error,
    });
  } catch (error: any) {
    console.error('Shipping rates error:', error);
    return NextResponse.json(
      { error: 'Failed to get shipping rates' },
      { status: 500 }
    );
  }
}
