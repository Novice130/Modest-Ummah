'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { TotpEnrollForm } from '@/components/admin/two-factor';
import {
  getAdminTwoFactorStatusAction,
  removeAdminAuthenticatorAction,
} from '@/lib/actions/admin-2fa.actions';

type Status = Exclude<
  Awaited<ReturnType<typeof getAdminTwoFactorStatusAction>>,
  { error: string }
>;

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
      <span>{children}</span>
    </p>
  );
}

export default function AdminSecurityPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await getAdminTwoFactorStatusAction();
    if ('error' in result) setError(result.error);
    else setStatus(result);
  }, []);

  useEffect(() => {
    load().catch(() => setError('Could not load two-factor status.'));
  }, [load]);

  const replace = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await removeAdminAuthenticatorAction(code);
      setCode('');
      if ('error' in result) {
        setError(result.error);
        return;
      }
      await load();
      setEnrolling(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return error ? (
      <p className="text-sm text-destructive">{error}</p>
    ) : (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="font-heading text-3xl mb-2">Sign-in security</h1>
        <p className="text-muted-foreground">Two-factor sign-in for your admin account.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Authenticator</CardTitle>
          <CardDescription>
            {status.required
              ? 'Two-factor is required: every admin sign-in asks for a code.'
              : 'Two-factor is not being enforced yet: sign-in asks only for a password, even after you set this up. It takes effect once ADMIN_2FA_REQUIRED=true is set on the server.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status.available && (
            <Warning>
              The two-factor table could not be read. Apply docs/migrations/admin_totp.sql before
              setting this up.
            </Warning>
          )}
          {!status.keyConfigured && (
            <Warning>
              ADMIN_TOTP_ENC_KEY is not set on the server. Setup will fail until it is.
            </Warning>
          )}

          {status.enrolled && !enrolling && (
            <>
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Set up. {status.recoveryCodesLeft} recovery{' '}
                {status.recoveryCodesLeft === 1 ? 'code' : 'codes'} left.
              </p>
              {status.recoveryCodesLeft <= 2 && (
                <Warning>
                  You are running out of recovery codes. Replacing the authenticator issues a new
                  set.
                </Warning>
              )}
              <form onSubmit={replace} className="space-y-3 border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  New phone? Enter a current code or a recovery code to replace the authenticator.
                  Your old recovery codes stop working.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="replace-code">Code</Label>
                  <Input
                    id="replace-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="one-time-code"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" variant="outline" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Replace authenticator
                </Button>
              </form>
            </>
          )}

          {(!status.enrolled || enrolling) && status.available && (
            <TotpEnrollForm
              onDone={() => {
                setEnrolling(false);
                load().catch(() => setError('Could not load two-factor status.'));
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
