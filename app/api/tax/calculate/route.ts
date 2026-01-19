import { NextRequest, NextResponse } from 'next/server';
import { calculateTax } from '@/lib/taxcloud';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, shippingAddress, customerId, cartId } = body;

    if (!items || !shippingAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: items and shippingAddress' },
        { status: 400 }
      );
    }

    const result = await calculateTax({
      items: items.map((item: any) => ({
        id: item.productId || item.id,
        price: item.price,
        quantity: item.quantity,
        category: item.category || 'accessories',
        subcategory: item.subcategory,
      })),
      shippingAddress: {
        address1: shippingAddress.address1,
        address2: shippingAddress.address2,
        city: shippingAddress.city,
        state: shippingAddress.state,
        postalCode: shippingAddress.postalCode || shippingAddress.zip,
      },
      customerId,
      cartId,
    });

    return NextResponse.json({
      success: result.success,
      totalTax: result.totalTax,
      itemTaxes: result.itemTaxes,
      error: result.error,
    });
  } catch (error: any) {
    console.error('Tax calculation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to calculate tax' },
      { status: 500 }
    );
  }
}
