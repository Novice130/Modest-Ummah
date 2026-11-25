import { json, apiError } from '@/lib/api/v1/http';
import { rateLimitV1Route } from '@/lib/rate-limit-guards';
import {
  SocialAuthError,
  verifyGoogleIdToken,
  findOrLinkSocialUser,
  createSocialUserToken,
} from '@/app/api/auth/social';

/**
 * POST /api/v1/auth/google  { idToken } -> { token, user }
 *
 * Same account logic as /api/auth/google, but no cookie: the app keeps the token
 * in the Keychain and sends it as a bearer header.
 */
export async function POST(request: Request) {
  try {
    const limited = rateLimitV1Route(request, 'social');
    if (limited) return limited;
    const { idToken } = await request.json();
    if (!idToken) {
      return apiError(400, 'idToken is required', 'missing_fields');
    }

    const user = await findOrLinkSocialUser(await verifyGoogleIdToken(idToken));
    const token = await createSocialUserToken(user);

    return json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || '',
        avatar: user.avatar || null,
      },
    });
  } catch (error: any) {
    if (error instanceof SocialAuthError) {
      return apiError(error.status, error.message, error.code);
    }
    console.error('POST /api/v1/auth/google', error);
    return apiError(500, 'Google sign-in failed. Please try again.');
  }
}
