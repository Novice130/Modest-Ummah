import { getDb } from '@/lib/db';
import { users, orders, carts } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { json, apiError, requireUser } from '@/lib/api/v1/http';

/** GET /api/v1/me — the signed-in customer's profile. */
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatar: users.avatar,
      verified: users.verified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, auth.user.sub))
    .limit(1);

  if (!user) return apiError(404, 'Account not found', 'not_found');
  return json({ ...user, createdAt: user.createdAt.toISOString() });
}

/** PATCH /api/v1/me — name and avatar only. */
export async function PATCH(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  try {
    const body = await request.json();
    const values: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.name === 'string') values.name = body.name.trim();
    if (typeof body.avatar === 'string' || body.avatar === null) values.avatar = body.avatar;

    // Email changes need a verification flow that does not exist yet, and
    // silently rewriting the login identity would be worse than refusing.
    if (body.email !== undefined) {
      return apiError(400, 'Email cannot be changed here', 'unsupported_field');
    }

    const db = getDb();
    const [user] = await db
      .update(users)
      .set(values)
      .where(eq(users.id, auth.user.sub))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        avatar: users.avatar,
      });

    if (!user) return apiError(404, 'Account not found', 'not_found');
    return json(user);
  } catch (error: any) {
    console.error('PATCH /api/v1/me', error);
    return apiError(500, 'Could not update your account');
  }
}

/**
 * DELETE /api/v1/me — permanent account deletion.
 *
 * App Store Guideline 5.1.1(v) requires an app that creates accounts to let a
 * customer delete theirs from inside the app, and reviewers test it. This is
 * the server half.
 *
 * Orders are NOT deleted: they are financial records, and orders.user_id is
 * ON DELETE SET NULL, so history survives detached from the person. The
 * customer's identifying columns go with the user row. The cart cascades.
 */
export async function DELETE(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  try {
    const db = getDb();

    // Strip PII from the retained order records before the row goes, so the
    // detached orders cannot be traced back by email.
    await db
      .update(orders)
      .set({ email: 'deleted@account.invalid' })
      .where(eq(orders.userId, auth.user.sub));

    await db.delete(carts).where(eq(carts.userId, auth.user.sub));
    await db.delete(users).where(eq(users.id, auth.user.sub));

    return json({ deleted: true });
  } catch (error: any) {
    console.error('DELETE /api/v1/me', error);
    return apiError(500, 'Could not delete your account');
  }
}
