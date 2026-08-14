import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { orders } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getTracking } from '@/lib/shipping';
import { getAuthFromRequest } from '@/lib/auth';

/**
 * Tracking lookup for a tracking number that belongs to one of our orders.
 *
 * This used to accept any string and forward it to the carrier, which made the
 * endpoint an open proxy against our carrier account: anyone could look up
 * arbitrary parcels, and drive unmetered requests, through our credentials.
 *
 * Now the number must match an order row, and the caller must be the customer
 * who placed it or an admin.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingNumber: string }> }
) {
  try {
    const { trackingNumber } = await params;

    if (!trackingNumber || !/^[A-Za-z0-9]{6,40}$/.test(trackingNumber)) {
      return NextResponse.json(
        { error: 'Tracking number is required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const [order] = await db
      .select({
        userId: orders.userId,
        trackingNumber: orders.trackingNumber,
      })
      .from(orders)
      .where(eq(orders.trackingNumber, trackingNumber))
      .limit(1);

    // Unknown numbers are indistinguishable from unauthorised ones, so this
    // cannot be used to probe which tracking numbers we hold.
    const [admin, user] = await Promise.all([
      getAuthFromRequest(request, true),
      getAuthFromRequest(request, false),
    ]);

    const isAdmin = admin?.type === 'admin';
    const isOwner =
      user?.type === 'user' && order?.userId != null && order.userId === user.sub;

    if (!order || (!isAdmin && !isOwner)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const result = await getTracking(trackingNumber);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to get tracking info' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      tracking: result.tracking,
    });
  } catch (error: any) {
    console.error('Tracking error:', error);
    return NextResponse.json(
      { error: 'Failed to get tracking info' },
      { status: 500 }
    );
  }
}
