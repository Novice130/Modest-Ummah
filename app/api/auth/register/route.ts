import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { users } from '@/lib/schema';
import { hashPassword, createToken, createAuthCookie } from '@/lib/auth';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if user already exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 400 }
      );
    }

    const passwordHashValue = await hashPassword(password);

    const [newUser] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        name: name || '',
        passwordHash: passwordHashValue,
        verified: false,
      })
      .returning();

    const token = await createToken({
      sub: newUser.id,
      email: newUser.email,
      name: newUser.name || '',
      type: 'user',
    });

    const { passwordHash: _, ...safeUser } = newUser;

    const response = NextResponse.json({
      token,
      record: {
        ...safeUser,
        id: newUser.id,
        collectionId: 'users',
        collectionName: 'users',
        created: newUser.createdAt.toISOString(),
        updated: newUser.updatedAt.toISOString(),
      },
    });

    response.headers.set('Set-Cookie', createAuthCookie(token));
    return response;
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Failed to create account. Please try again.' },
      { status: 500 }
    );
  }
}
