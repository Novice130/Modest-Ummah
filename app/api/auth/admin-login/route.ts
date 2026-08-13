import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { admins } from '@/lib/schema';
import { verifyPassword, createToken, createAuthCookie } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { adminIsLocked, recordAdminAttempt } from '@/lib/admin-login-guard';

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const ip = clientIp(request);

    if (await adminIsLocked(normalizedEmail, ip)) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const db = getDb();
    const [admin] = await db
      .select()
      .from(admins)
      .where(eq(admins.email, normalizedEmail))
      .limit(1);

    if (!admin) {
      await recordAdminAttempt(normalizedEmail, ip);
      return NextResponse.json(
        { error: 'Invalid admin credentials' },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, admin.passwordHash);
    if (!valid) {
      await recordAdminAttempt(normalizedEmail, ip);
      return NextResponse.json(
        { error: 'Invalid admin credentials' },
        { status: 401 }
      );
    }

    const token = await createToken(
      {
        sub: admin.id,
        email: admin.email,
        name: admin.name || 'Admin',
        type: 'admin',
      },
      true // isAdmin
    );

    const response = NextResponse.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
      },
    });

    response.headers.set('Set-Cookie', createAuthCookie(token, true));
    return response;
  } catch (error: any) {
    console.error('Admin login error:', error);
    return NextResponse.json(
      { error: 'Invalid admin credentials' },
      { status: 500 }
    );
  }
}
