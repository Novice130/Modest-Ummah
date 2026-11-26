import { NextRequest, NextResponse } from 'next/server';
import { createAuthCookie } from '@/lib/auth';
import { rateLimitRoute } from '@/lib/rate-limit-guards';
import {
  SocialAuthError,
  verifyAppleIdentityToken,
  findOrLinkSocialUser,
  createSocialUserToken,
} from '../social';

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimitRoute(request, 'social');
    if (limited) return limited;
    const { identityToken, name } = await request.json();

    if (!identityToken) {
      return NextResponse.json({ error: 'identityToken is required' }, { status: 400 });
    }

    const user = await findOrLinkSocialUser(await verifyAppleIdentityToken(identityToken, name));
    const token = await createSocialUserToken(user);

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
    if (error instanceof SocialAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Apple sign-in error:', error);
    return NextResponse.json(
      { error: 'Apple sign-in failed. Please try again.' },
      { status: 500 }
    );
  }
}
