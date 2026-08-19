import { getDb } from '@/lib/db';
import { orders } from '@/lib/schema';
import { desc, eq } from 'drizzle-orm';
import { json, apiError, requireUser, parsePagination } from '@/lib/api/v1/http';

/**
 * GET /api/v1/orders — the caller's own orders.
 *
 * Scoped by user_id from the verified token, never by an id in the query
 * string. This is the endpoint the Woo shim deliberately does NOT provide
 * safely: /wp-json/wc/*_/orders returns every paid order for the label printer.
 */
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  const { page, perPage } = parsePagination(new URL(request.url));

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: orders.id,
        orderId: orders.orderId,
        items: orders.items,
        subtotal: orders.subtotal,
        shipping: orders.shipping,
        tax: orders.tax,
        discount: orders.discount,
        total: orders.total,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        trackingNumber: orders.trackingNumber,
        trackingCarrier: orders.trackingCarrier,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.userId, auth.user.sub))
      .orderBy(desc(orders.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage);

    return json({
      items: rows.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() })),
      page,
      perPage,
    });
  } catch (error: any) {
    console.error('GET /api/v1/orders', error);
    return apiError(500, 'Could not load your orders');
  }
}
