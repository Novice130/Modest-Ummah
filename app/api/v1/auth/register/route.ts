import { getDb } from '@/lib/db';
import { users } from '@/lib/schema';
import { hashPassword, createToken } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { json, apiError } from '@/lib/api/v1/http';

/** POST /api/v1/auth/register  { email, password, name } -> { token, user } */
export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password) {
      return apiError(400, 'Email and password are required', 'missing_fields');
    }
    if (String(password).length < 8) {
      return apiError(400, 'Password must be at least 8 characters', 'weak_password');
    }

    const db = getDb();
    const normalized = String(email).toLowerCase().trim();

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1);
    if (existing) {
      return apiError(409, 'An account with that email already exists', 'email_taken');
    }

    const [user] = await db
      .insert(users)
      .values({
        email: normalized,
        name: String(name || '').trim(),
        passwordHash: await hashPassword(String(password)),
      })
      .returning();

    const token = await createToken({
      sub: user.id,
      email: user.email,
      name: user.name || '',
      type: 'user',
    });

    return json(
      {
        token,
        user: { id: user.id, email: user.email, name: user.name || '', avatar: null },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/v1/auth/register', error);
    return apiError(500, 'Something went wrong. Please try again.');
  }
}
