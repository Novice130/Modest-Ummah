import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { users } from '@/lib/schema';
import { createToken, createAuthCookie } from '@/lib/auth';
import { eq } from 'drizzle-orm';

const VALID_CLIENT_IDS = [
  process.env.GOOGLE_CLIENT_ID,
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
  '488492087162-3gtbu198aonl52qckg9cdnk7s52l6c0a.apps.googleusercontent.com', // Web
  '488492087162-obnf3re3g69op8abgk61j2dbsh2p7d76.apps.googleusercontent.com', // Android
  '488492087162-6do55jqj0ldo5efjvsibea9ehfl324nk.apps.googleusercontent.com', // iOS
].filter(Boolean) as string[];

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
    }

    // Verify token with Google's tokeninfo API
    const googleRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );

    if (!googleRes.ok) {
      return NextResponse.json(
        { error: 'Invalid or expired Google token' },
        { status: 401 }
      );
    }

    const payload = await googleRes.json();

    // Verify the audience (client_id)
    if (!VALID_CLIENT_IDS.includes(payload.aud)) {
      console.warn('Google token audience mismatch:', payload.aud);
      return NextResponse.json(
        { error: 'Token was not issued for this application' },
        { status: 401 }
      );
    }

    const email = payload.email?.toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: 'Google account has no associated email' },
        { status: 400 }
      );
    }

    const name = payload.name || payload.given_name || '';
    const avatar = payload.picture || null;
    const providerId = payload.sub;

    const db = getDb();
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      const [newUser] = await db
        .insert(users)
        .values({
          email,
          name,
          avatar,
          verified: payload.email_verified === 'true' || payload.email_verified === true,
          authProvider: 'google',
          providerId,
        })
        .returning();
      user = newUser;
    } else {
      // Update avatar/name/provider if missing
      await db
        .update(users)
        .set({
          name: user.name || name,
          avatar: user.avatar || avatar,
          authProvider: user.authProvider || 'google',
          providerId: user.providerId || providerId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }

    const token = await createToken({
      sub: user.id,
      email: user.email,
      name: user.name || '',
      type: 'user',
    });

    const { passwordHash: _, ...safeUser } = user;

    const response = NextResponse.json({
      token,
      record: {
        ...safeUser,
        id: user.id,
        created: user.createdAt.toISOString(),
        updated: user.updatedAt.toISOString(),
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    });

    response.headers.set('Set-Cookie', createAuthCookie(token));
    return response;
  } catch (error: any) {
    console.error('Google sign-in error:', error);
    return NextResponse.json(
      { error: 'Google sign-in failed. Please try again.' },
      { status: 500 }
    );
  }
}
