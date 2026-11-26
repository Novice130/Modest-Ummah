import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { orders } from '@/lib/schema';
import { getAuthFromRequest } from '@/lib/auth';
import { inArray, asc } from 'drizzle-orm';
import type { ShippingAddressDB, OrderItem, OrderSelect } from '@/lib/schema';
import { stringifyCsv } from '@/lib/csv';
import { computeParcel } from '@/lib/parcel';
import { buildOrderFilter } from '@/lib/order-filters';
import { formatOrderStatus, formatPaymentStatus, isPaymentCaptured, type OrderListFilters } from '@/lib/order-status';

/**
 * Admin order export.
 *
 *  - format "pirateship" (default): Pirate Ship's spreadsheet import. Only
 *    orders that are paid and not yet shipped/cancelled are included, so an
 *    export can never buy a label for an unpaid order or a second label for a
 *    shipped one; the number skipped is returned in X-Export-Skipped.
 *    Weight and box come from lib/parcel (the line items' weight snapshots
 *    plus declared product dimensions), the same calculator checkout quotes
 *    with. The old generator in lib/admin-helpers guessed 8 oz per item, a
 *    fixed 12x9x4 box, and put the store's own name in the recipient
 *    "Company" column.
 *  - format "orders": a bookkeeping export of every matching order with the
 *    full money breakdown, items and tracking. Formula-escaped for Excel.
 *
 * Rows are either the explicit `orderIds` (the admin's selection) or every
 * order matching `filters` — the same filter the list page uses, so "export
 * all" covers all pages, not just the 25 rows on screen.
 */

const MAX_ROWS = 5000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request, true);
  if (!auth || auth.type !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const format: 'pirateship' | 'orders' = body?.format === 'orders' ? 'orders' : 'pirateship';
    const orderIds: string[] = Array.isArray(body?.orderIds)
      ? body.orderIds.filter((id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id)).slice(0, MAX_ROWS)
      : [];
    const filters: OrderListFilters =
      body?.filters && typeof body.filters === 'object' ? body.filters : {};

    // An explicit selection that resolves to nothing must not silently
    // widen into "export everything".
    if (Array.isArray(body?.orderIds) && orderIds.length === 0) {
      return NextResponse.json({ error: 'No valid orders selected' }, { status: 400 });
    }

    const db = getDb();
    const where = orderIds.length > 0 ? inArray(orders.id, orderIds) : buildOrderFilter(filters);

    const rows = await db
      .select()
      .from(orders)
      .where(where)
      .orderBy(asc(orders.createdAt))
      .limit(MAX_ROWS);

    const date = new Date().toISOString().split('T')[0];

    if (format === 'orders') {
      const csv = '﻿' + stringifyCsv([ORDERS_HEADER, ...rows.map(orderRow)], {
        escapeFormulas: true,
        lineEnding: '\r\n',
      });
      return csvResponse(csv, `orders_${date}.csv`, rows.length, 0);
    }

    const shippable = rows.filter(
      (o) => isPaymentCaptured(o.paymentStatus) && (o.status === 'processing' || o.status === 'pending')
    );
    const lines = await Promise.all(shippable.map(pirateShipRow));
    // Formula-escaped too: names and addresses are customer input.
    const csv = stringifyCsv([PIRATE_SHIP_HEADER, ...lines], { escapeFormulas: true });
    return csvResponse(csv, `pirate_ship_export_${date}.csv`, shippable.length, rows.length - shippable.length);
  } catch (error: any) {
    console.error('CSV export error:', error);
    return NextResponse.json({ error: 'Failed to export orders' }, { status: 500 });
  }
}

function csvResponse(csv: string, filename: string, exported: number, skipped: number) {
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Count': String(exported),
      'X-Export-Skipped': String(skipped),
    },
  });
}

// ─── Pirate Ship ────────────────────────────────────────

const PIRATE_SHIP_HEADER = [
  'Name',
  'Company',
  'Email',
  'Phone',
  'Address Line 1',
  'Address Line 2',
  'City',
  'State',
  'Zip',
  'Country',
  'Weight (oz)',
  'Length (in)',
  'Width (in)',
  'Height (in)',
  'Order ID',
];

async function pirateShipRow(o: OrderSelect) {
  const addr = (o.shippingAddress || {}) as ShippingAddressDB;
  const items = (Array.isArray(o.items) ? o.items : []) as OrderItem[];
  const parcel = await computeParcel(
    items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
      weightOz: i.weightOz,
    }))
  );
  return [
    `${addr.firstName || ''} ${addr.lastName || ''}`.trim(),
    '',
    o.email,
    addr.phone || '',
    addr.address1 || '',
    addr.address2 || '',
    addr.city || '',
    addr.state || '',
    addr.postalCode || '',
    addr.country || 'US',
    Math.round(parcel.weight * 10) / 10,
    parcel.length,
    parcel.width,
    parcel.height,
    o.orderId,
  ];
}

// ─── Bookkeeping export ─────────────────────────────────

const ORDERS_HEADER = [
  'Order',
  'Created (UTC)',
  'Status',
  'Payment',
  'Customer',
  'Email',
  'Phone',
  'Address Line 1',
  'Address Line 2',
  'City',
  'State',
  'Zip',
  'Country',
  'Items',
  'Item Count',
  'Subtotal',
  'Discount',
  'Coupon',
  'Shipping',
  'Shipping Service',
  'Tax',
  'Total',
  'Carrier',
  'Tracking Number',
  'Shipped (UTC)',
  'Delivered (UTC)',
  'Stripe Payment',
];

function orderRow(o: OrderSelect) {
  const addr = (o.shippingAddress || {}) as ShippingAddressDB;
  const items = (Array.isArray(o.items) ? o.items : []) as OrderItem[];
  const itemText = items
    .map((i) => {
      const variant = [i.color, i.size].filter(Boolean).join(' / ');
      return `${i.quantity} x ${i.name}${variant ? ` (${variant})` : ''}${i.sku ? ` [${i.sku}]` : ''}`;
    })
    .join('; ');
  return [
    o.orderId,
    o.createdAt.toISOString(),
    formatOrderStatus(o.status),
    formatPaymentStatus(o.paymentStatus),
    `${addr.firstName || ''} ${addr.lastName || ''}`.trim(),
    o.email,
    addr.phone || '',
    addr.address1 || '',
    addr.address2 || '',
    addr.city || '',
    addr.state || '',
    addr.postalCode || '',
    addr.country || '',
    itemText,
    items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0),
    o.subtotal,
    o.discount,
    o.couponCode || '',
    o.shipping,
    o.shippingService || '',
    o.tax,
    o.total,
    o.trackingCarrier || '',
    o.trackingNumber || '',
    o.shippedAt ? o.shippedAt.toISOString() : '',
    o.deliveredAt ? o.deliveredAt.toISOString() : '',
    o.paymentIntentId || '',
  ];
}
