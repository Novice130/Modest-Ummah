import { json, apiError, requireUser } from '@/lib/api/v1/http';
import { changeUserPassword } from '@/lib/account';

/**
 * POST /api/v1/me/password  { currentPassword, newPassword }
 *
 * Rotating the password bumps users.token_version, so the bearer token used to
 * make this very call stops working: the client must sign in again with the new
 * password. That is the point — it is also what retires a token stolen from
 * another device.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  try {
    const body = await request.json();
    await changeUserPassword(
      auth.user.sub,
      String(body?.currentPassword || ''),
      String(body?.newPassword || '')
    );
    return json({ changed: true, reauthenticate: true });
  } catch (error: any) {
    const message = error?.message || 'Could not change your password';
    // The routine throws for a wrong current password and for a too-short new
    // one; both are the caller's fault, not a server fault.
    const isClientError =
      /incorrect|required|at least|not found/i.test(message);
    if (isClientError) return apiError(400, message, 'invalid_password');

    console.error('POST /api/v1/me/password', error);
    return apiError(500, 'Could not change your password');
  }
}
