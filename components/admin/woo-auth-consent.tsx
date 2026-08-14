'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { approveWooAuthAction, denyWooAuthAction } from '@/lib/actions/woo-auth.actions';

/**
 * Approve/deny buttons for /wc-auth/v1/authorize.
 *
 * Both outcomes end in a full-page navigation to the requesting app's return
 * URL — that is an external host, so router.push() is not the right tool and
 * window.location is used deliberately.
 */
export default function WooAuthConsent({
  params,
  appName,
}: {
  params: Record<string, string>;
  appName: string;
}) {
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState('');

  const run = async (choice: 'approve' | 'deny') => {
    setBusy(choice);
    setError('');
    try {
      const result =
        choice === 'approve'
          ? await approveWooAuthAction(params)
          : await denyWooAuthAction(params);

      if (result.ok && result.redirectTo) {
        window.location.href = result.redirectTo;
        return;
      }
      setError(result.error || 'The request could not be completed.');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-6">
      {error && (
        <p className="text-sm text-destructive mb-4" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button onClick={() => run('approve')} disabled={busy !== null} className="flex-1">
          {busy === 'approve' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Approve {appName}
        </Button>
        <Button
          variant="outline"
          onClick={() => run('deny')}
          disabled={busy !== null}
          className="flex-1"
        >
          {busy === 'deny' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Deny
        </Button>
      </div>
    </div>
  );
}
