import { AuthProvider } from '@/components/providers/auth-provider';
import { getSession } from '@/lib/actions/auth.actions';
import AppShell from '@/components/layout/app-shell';
import { Toaster } from '@/components/ui/toaster';

/**
 * Reads the session cookie and renders the authenticated shell. Lives
 * behind a <Suspense> boundary in the root layout because cookies() is
 * uncached request data — with cacheComponents enabled, reading it in the
 * layout itself would block prerendering of every route.
 */
export async function SessionShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <AuthProvider initialUser={session as any}>
      <AppShell>{children}</AppShell>
      <Toaster />
    </AuthProvider>
  );
}
