import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { users, products, orders } from '@/lib/schema';
import { getAuthFromRequest } from '@/lib/auth';
import { like, or, desc, count, sum, eq } from 'drizzle-orm';

/**
 * Generic data API route for client-side collection queries.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request, true);
  // Allow user-auth too for non-admin collections
  const userAuth = auth || (await getAuthFromRequest(request, false));

  const { searchParams } = new URL(request.url);
  const collection = searchParams.get('collection') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const perPage = parseInt(searchParams.get('perPage') || '50', 10);
  const filter = searchParams.get('filter') || '';
  const offset = (page - 1) * perPage;

  const db = getDb();

  try {
    switch (collection) {
      case 'users': {
        // Admin only
        if (!auth || auth.type !== 'admin') {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let where: any = undefined;
        if (filter) {
          const conditions = [];
          const emailMatch = filter.match(/email~"([^"]+)"/);
          const nameMatch = filter.match(/name~"([^"]+)"/);
          if (emailMatch)
            conditions.push(like(users.email, `%${emailMatch[1]}%`));
          if (nameMatch)
            conditions.push(like(users.name, `%${nameMatch[1]}%`));
          if (conditions.length > 0) where = or(...conditions);
        }

        const [countResult] = await db
          .select({ count: count() })
          .from(users)
          .where(where);

        const items = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            createdAt: users.createdAt,
            verified: users.verified,
          })
          .from(users)
          .where(where)
          .orderBy(desc(users.createdAt))
          .limit(perPage)
          .offset(offset);

        // Enrich with order stats per customer
        const enriched = await Promise.all(
          items.map(async (user) => {
            const [orderStats] = await db
              .select({
                totalOrders: count(),
                totalSpent: sum(orders.total),
              })
              .from(orders)
              .where(eq(orders.userId, user.id));

            return {
              ...user,
              createdAt: user.createdAt.toISOString(),
              totalOrders: orderStats?.totalOrders || 0,
              totalSpent: parseFloat(orderStats?.totalSpent || '0'),
            };
          })
        );

        return NextResponse.json({
          items: enriched,
          totalItems: countResult?.count || 0,
          totalPages: Math.ceil((countResult?.count || 0) / perPage),
          page,
          perPage,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown collection: ${collection}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Data API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
