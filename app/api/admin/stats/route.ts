import { NextRequest, NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/admin-helpers';
import { getAuthFromRequest } from '@/lib/auth';

// Admin data: never let a browser or the CDN keep a copy.
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  // Verify admin auth (the proxy matcher covers /admin pages, not /api/admin).
  const auth = await getAuthFromRequest(request, true);
  if (!auth || auth.type !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  try {
    const stats = await getDashboardStats();
    return NextResponse.json(stats, { headers: NO_STORE });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500, headers: NO_STORE }
    );
  }
}
