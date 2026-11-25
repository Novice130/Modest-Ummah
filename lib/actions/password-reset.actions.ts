'use server';

import { after } from 'next/server';
import { confirmPasswordReset, requestPasswordReset } from '@/lib/password-reset';
import { MIN_PASSWORD_LENGTH } from '@/lib/account';

/** Always the same reply, whether or not the address has an account. */
export async function requestPasswordResetAction(email: string): Promise<{ success: true }> {
  if (typeof email === 'string' && email.includes('@') && email.length <= 320) {
    after(() =>
      requestPasswordReset(email).catch((error) => {
        console.error('requestPasswordReset error:', error);
      })
    );
  }
  return { success: true };
}

export async function resetPasswordAction(
  token: string,
  password: string
): Promise<{ success: true } | { error: string }> {
  try {
    const result = await confirmPasswordReset(token, password);
    if (result.ok) return { success: true };
    return {
      error:
        result.reason === 'weak_password'
          ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
          : 'This reset link is invalid or has expired. Please request a new one.',
    };
  } catch (error) {
    console.error('resetPasswordAction error:', error);
    return { error: 'Something went wrong. Please try again.' };
  }
}
