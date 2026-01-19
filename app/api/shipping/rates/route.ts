import { NextRequest, NextResponse } from 'next/server';
import { getShippingRates, calculatePackageDimensions } from '@/lib/shipping';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, shippingAddress } = body;

    if (!items || !shippingAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: items and shippingAddress' },
        { status: 400 }
      );
    }

    // Calculate package dimensions based on items
    const packageDimensions = calculatePackageDimensions(
      items.map((item: any) => ({
        weight: item.weight,
        quantity: item.quantity,
      }))
    );

    const result = await getShippingRates({
      destination: {
        name: `${shippingAddress.firstName || ''} ${shippingAddress.lastName || ''}`.trim() || 'Customer',
        street1: shippingAddress.address1,
        street2: shippingAddress.address2 || '',
        city: shippingAddress.city,
        state: shippingAddress.state,
        zip: shippingAddress.postalCode || shippingAddress.zip,
        country: shippingAddress.country || 'US',
        phone: shippingAddress.phone,
        email: shippingAddress.email,
      },
      package: packageDimensions,
    });

    return NextResponse.json({
      success: result.success,
      rates: result.rates,
      error: result.error,
    });
  } catch (error: any) {
    console.error('Shipping rates error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get shipping rates' },
      { status: 500 }
    );
  }
}
