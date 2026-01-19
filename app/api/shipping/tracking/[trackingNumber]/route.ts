import { NextRequest, NextResponse } from 'next/server';
import { getTracking } from '@/lib/shipping';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingNumber: string }> }
) {
  try {
    const { trackingNumber } = await params;

    if (!trackingNumber) {
      return NextResponse.json(
        { error: 'Tracking number is required' },
        { status: 400 }
      );
    }

    const result = await getTracking(trackingNumber);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to get tracking info' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tracking: result.tracking,
    });
  } catch (error: any) {
    console.error('Tracking error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get tracking info' },
      { status: 500 }
    );
  }
}
