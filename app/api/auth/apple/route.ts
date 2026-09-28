import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { users } from '@/lib/schema';
import { createToken, createAuthCookie } from '@/lib/auth';
import { eq, or } from 'drizzle-orm';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

const VALID_AUDIENCES = [
  process.env.APPLE_BUNDLE_ID,
  process.env.APPLE_SERVICES_ID,
  'com.modestummah.modestUmmah',
  'com.modestummah.web',
].filter(Boolean) as string[];

export async function POST(request: NextRequest) {
  try {
    const { identityToken, name } = await request.json();

    if (!identityToken) {
      return NextResponse.json(
        { error: 'identityToken is required' },
        { status: 400 }
      );
    }

    // Verify Apple's identity token
    const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
      issuer: 'https://appleid.apple.com',
      audience: VALID_AUDIENCES,
    });

    const appleUserId = payload.sub;
    const tokenEmail = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;

    if (!appleUserId) {
      return NextResponse.json(
        { error: 'Invalid Apple identity token: missing sub' },
        { status: 401 }
      );
    }

    const db = getDb();

    // Look up by providerId first, or by email if token contains email
    let user = (
      await db
        .select()
        .from(users)
        .where(
          tokenEmail
            ? or(eq(users.providerId, appleUserId), eq(users.email, tokenEmail))
            : eq(users.providerId, appleUserId)
        )
        .limit(1)
    )[0];

    if (!user) {
      const emailToUse = tokenEmail || `${appleUserId}@privaterelay.appleid.com`;
      const [newUser] = await db
        .insert(users)
        .values({
          email: emailToUse,
          name: name || 'Apple User',
          verified: true,
          authProvider: 'apple',
          providerId: appleUserId,
        })
        .returning();
      user = newUser;
    } else {
      // Update name/providerId if previously missing
      await db
        .update(users)
        .set({
          name: user.name || name || '',
          providerId: appleUserId,
          authProvider: user.authProvider || 'apple',
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
    console.error('Apple sign-in error:', error);
    return NextResponse.json(
      { error: 'Apple sign-in failed. Please try again.' },
      { status: 500 }
    );
  }
}
