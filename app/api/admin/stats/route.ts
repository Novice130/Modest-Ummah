import { NextRequest, NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/admin-helpers';
import { getAuthFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  // Verify admin auth
  const auth = await getAuthFromRequest(request, true);
  if (!auth || auth.type !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = await getDashboardStats();
    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
