import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { orders } from '@/lib/schema';
import { generatePirateShipCSV } from '@/lib/admin-helpers';
import { getAuthFromRequest } from '@/lib/auth';
import { eq, inArray, and } from 'drizzle-orm';
import type { ShippingAddressDB, OrderItem } from '@/lib/schema';

export async function POST(request: NextRequest) {
  // Verify admin auth
  const auth = await getAuthFromRequest(request, true);
  if (!auth || auth.type !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { orderIds, statusFilter } = body;

    const db = getDb();

    const conditions = [];
    if (orderIds && orderIds.length > 0) {
      conditions.push(inArray(orders.id, orderIds));
    }
    if (statusFilter && statusFilter !== 'all') {
      conditions.push(eq(orders.status, statusFilter));
    }
    if (conditions.length === 0) {
      // Default: all paid orders awaiting fulfillment.
      conditions.push(eq(orders.paymentStatus, 'paid'));
    }

    const orderData = await db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(orders.createdAt);

    const csvInput = orderData.map((o) => ({
      orderId: o.orderId,
      email: o.email,
      shippingAddress: o.shippingAddress as ShippingAddressDB,
      items: (o.items || []) as OrderItem[],
      total: parseFloat(o.total as string),
    }));

    const csv = generatePirateShipCSV(csvInput);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="pirate_ship_export_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('CSV export error:', error);
    return NextResponse.json(
      { error: 'Failed to export orders' },
      { status: 500 }
    );
  }
}
