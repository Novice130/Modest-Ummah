import { getDb } from '@/lib/db';
import { users } from '@/lib/schema';
import { verifyPassword, createToken } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { json, apiError } from '@/lib/api/v1/http';

/**
 * POST /api/v1/auth/login  { email, password } -> { token, user }
 *
 * Unlike /api/auth/login this sets no cookie: the caller is a native client
 * that stores the token in the Keychain and sends it as a bearer header.
 */
export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return apiError(400, 'Email and password are required', 'missing_fields');
    }

    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, String(email).toLowerCase()))
      .limit(1);

    // Same message for "no such user" and "wrong password" so the endpoint
    // cannot be used to enumerate registered addresses.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return apiError(401, 'Invalid email or password.', 'invalid_credentials');
    }

    const token = await createToken({
      sub: user.id,
      email: user.email,
      name: user.name || '',
      type: 'user',
      ver: user.tokenVersion,
    });

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
    console.error('POST /api/v1/auth/login', error);
    return apiError(500, 'Something went wrong. Please try again.');
  }
}
