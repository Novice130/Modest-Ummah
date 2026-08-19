import { getDb } from '@/lib/db';
import { orders } from '@/lib/schema';
import { and, eq, or } from 'drizzle-orm';
import { json, apiError, requireUser } from '@/lib/api/v1/http';

/**
 * GET /api/v1/orders/:id — accepts the uuid or the human order_id.
 *
 * Someone else's order returns 404, not 403: a 403 confirms the id exists,
 * which is enough to enumerate order numbers.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  const { id } = await params;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  try {
    const db = getDb();
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, auth.user.sub),
          isUuid ? or(eq(orders.id, id), eq(orders.orderId, id)) : eq(orders.orderId, id)
        )
      )
      .limit(1);

    if (!order) return apiError(404, 'Order not found', 'not_found');

    return json({
      ...order,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      shippedAt: order.shippedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      // Internal fulfilment fields the customer has no business seeing.
      labelUrl: undefined,
      shipmentId: undefined,
      paymentIntentId: undefined,
      wooId: undefined,
    });
  } catch (error: any) {
    console.error('GET /api/v1/orders/[id]', error);
    return apiError(500, 'Could not load that order');
  }
}
