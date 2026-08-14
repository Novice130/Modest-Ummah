import { Suspense } from 'react';
import Link from 'next/link';
import { getSession } from '@/lib/actions/auth.actions';
import {
  validateWooAuthRequest,
  hostOf,
  permissionsForScope,
} from '@/lib/woo/auth-endpoint';
import WooAuthConsent from '@/components/admin/woo-auth-consent';
import { AlertTriangle, Lock } from 'lucide-react';

/**
 * /wc-auth/v1/authorize — WooCommerce's key-exchange screen.
 *
 * An app that wants API access sends the merchant's browser here rather than
 * asking them to paste credentials. The merchant approves, the store mints a
 * key pair and POSTs it to the app's callback URL, and the browser is returned
 * to the app. Pirate Ship uses this flow; hitting it on a store that does not
 * serve the path is a plain 404, which is how it failed on 2026-08-14.
 *
 * Reference: WooCommerce includes/class-wc-auth.php.
 */

// No `export const dynamic` — nextConfig.cacheComponents rejects the segment
// config. Instead the request-dependent work (searchParams, the session
// cookie) sits inside a Suspense boundary, which is what cacheComponents wants
// from a route that cannot be prerendered.

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-lg p-8 bg-background border rounded-lg shadow-sm">
        {children}
      </div>
    </div>
  );
}

export default function WooAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense
      fallback={
        <Shell>
          <p className="text-sm text-muted-foreground text-center">
            Loading authorization request…
          </p>
        </Shell>
      }
    >
      <AuthorizeRequest searchParams={searchParams} />
    </Suspense>
  );
}

async function AuthorizeRequest({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const validation = validateWooAuthRequest(params);

  if (!validation.ok) {
    return (
      <Shell>
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <h1 className="text-xl font-bold font-heading">Authorization request rejected</h1>
            <p className="text-sm text-muted-foreground mt-2">{validation.error}</p>
          </div>
        </div>
      </Shell>
    );
  }

  const request = validation.request;

  // Approving mints a credential that reads customer names, addresses, emails
  // and phone numbers. Only a signed-in admin may do that, and the check is
  // repeated inside the action — this one only decides what to render.
  const session = await getSession(true);
  if (!session) {
    const query = new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) =>
        typeof value === 'string' ? [[key, value] as [string, string]] : []
      )
    ).toString();

    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 flex items-center justify-center rounded-full mb-4">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold font-heading">Sign in to continue</h1>
          <p className="text-sm text-muted-foreground mt-2">
            <strong>{request.appName}</strong> is asking for access to this store. Sign in as
            an administrator to review the request.
          </p>
          <Link
            href={`/admin/login?redirect=${encodeURIComponent(`/wc-auth/v1/authorize?${query}`)}`}
            className="inline-flex items-center justify-center mt-6 h-10 px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            Sign in
          </Link>
        </div>
      </Shell>
    );
  }

  const permissions = permissionsForScope(request.scope);

  return (
    <Shell>
      <h1 className="text-xl font-bold font-heading">Connect {request.appName}</h1>
      <p className="text-sm text-muted-foreground mt-2">
        {request.appName} is requesting API access to this store. Approving creates a new
        key and sends it directly to the app — it is never shown on screen.
      </p>

      <dl className="mt-6 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Application</dt>
          <dd className="font-medium">{request.appName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Access requested</dt>
          <dd className="font-medium">
            {permissions === 'read_write' ? 'Read and write' : 'Read only'}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Credentials sent to</dt>
          <dd className="font-mono text-xs break-all text-right">
            {hostOf(request.callbackUrl)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Approving as</dt>
          <dd className="font-medium">{session.email}</dd>
        </div>
      </dl>

      <div className="mt-6 flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          {permissions === 'read_write'
            ? 'This grants read and write access to orders, including customer names, addresses, emails and phone numbers. Approve only if you started this connection.'
            : 'This grants read access to orders, including customer contact details. Approve only if you started this connection.'}
        </p>
      </div>

      <WooAuthConsent
        params={Object.fromEntries(
          Object.entries(params).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )}
        appName={request.appName}
      />
    </Shell>
  );
}
