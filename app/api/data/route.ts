import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { users, orders } from '@/lib/schema';
import { getAuthFromRequest } from '@/lib/auth';
import { like, or, desc, count, sum, eq, sql } from 'drizzle-orm';

/**
 * Generic data API route for client-side collection queries.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request, true);

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

        // Single query with a LEFT JOIN + GROUP BY replaces the old N+1
        // pattern (one orders query per user).
        const rows = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            createdAt: users.createdAt,
            verified: users.verified,
            totalOrders: sql<number>`COUNT(${orders.id})::int`,
            totalSpent: sql<number>`COALESCE(SUM(${orders.total}), 0)::float`,
          })
          .from(users)
          .leftJoin(orders, eq(orders.userId, users.id))
          .where(where)
          .groupBy(users.id, users.email, users.name, users.createdAt, users.verified)
          .orderBy(desc(users.createdAt))
          .limit(perPage)
          .offset(offset);

        return NextResponse.json({
          items: rows.map((u) => ({
            ...u,
            createdAt: u.createdAt.toISOString(),
          })),
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
