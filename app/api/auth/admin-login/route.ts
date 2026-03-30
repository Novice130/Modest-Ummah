import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { admins } from '@/lib/schema';
import { verifyPassword, createToken, createAuthCookie } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const [admin] = await db
      .select()
      .from(admins)
      .where(eq(admins.email, email.toLowerCase()))
      .limit(1);

    if (!admin) {
      return NextResponse.json(
        { error: 'Invalid admin credentials' },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, admin.passwordHash);
    if (!valid) {
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
