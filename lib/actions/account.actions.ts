'use server';

/**
 * The signed-in customer acting on their own account.
 *
 * lib/actions/customer.actions.ts is the admin's view of a customer; this is
 * the customer's view of themselves, so the session check differs (getSession()
 * without the admin flag) and the write surface is much smaller.
 */
import { getSession, clearSession } from './auth.actions';
import { updateUserName, changeUserPassword, type AccountProfile } from '@/lib/account';

export async function updateProfileAction(input: { name: string }): Promise<AccountProfile> {
  const session = await getSession();
  if (!session) throw new Error('Sign in to continue');

  return updateUserName(session.id, input.name);
}

/**
 * Rotates the password, then drops this session's cookie: the token it holds
 * was minted against the old token_version and is no longer accepted, so
 * leaving it in place would just produce a confusing signed-out-looking page
 * on the next navigation.
 */
export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ signedOut: true }> {
  const session = await getSession();
  if (!session) throw new Error('Sign in to continue');

  await changeUserPassword(session.id, input.currentPassword, input.newPassword);
  await clearSession();

  return { signedOut: true };
}
