'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  confirmAdminEnrollmentAction,
  startAdminEnrollmentAction,
  verifyAdminTwoFactorAction,
} from '@/lib/actions/admin-2fa.actions';

function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
      {message}
    </div>
  );
}

/** Text, not numeric: this field also takes recovery codes, which have letters. */
function CodeInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="one-time-code"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
      />
    </div>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" className="w-full" disabled={busy}>
      {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

export function TotpVerifyForm({
  onVerified,
  onCancel,
}: {
  onVerified: (usedRecoveryCode: boolean) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await verifyAdminTwoFactorAction(code);
      if ('error' in result) {
        setError(result.error);
        setCode('');
        return;
      }
      onVerified(result.usedRecoveryCode);
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter the six-digit code from your authenticator app. If you no longer have it, enter
        one of your recovery codes.
      </p>
      <CodeInput id="totp-code" label="Code" value={code} onChange={setCode} />
      <ErrorNote message={error} />
      <SubmitButton busy={busy}>Verify</SubmitButton>
      <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
        Start over
      </Button>
    </form>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Save your recovery codes now.</p>
      <p className="text-sm text-muted-foreground">
        They are shown once and each works once. Keep them in your password manager, not only on
        the device with the authenticator. If you lose both, getting back in needs access to the
        server.
      </p>
      <ul className="grid gap-1 rounded-md bg-muted p-3 font-mono text-sm sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <Button type="button" variant="outline" className="w-full" onClick={copy}>
        {copied ? 'Copied' : 'Copy codes'}
      </Button>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        I have saved these codes somewhere safe.
      </label>
      <Button type="button" className="w-full" disabled={!saved} onClick={onDone}>
        Continue
      </Button>
    </div>
  );
}

export function TotpEnrollForm({
  required = false,
  onDone,
  onCancel,
}: {
  /** True during sign-in, when the admin cannot continue without enrolling. */
  required?: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const begin = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await startAdminEnrollmentAction();
      if ('error' in result) setError(result.error);
      else setSetup(result);
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await confirmAdminEnrollmentAction(code);
      if ('error' in result) {
        setError(result.error);
        setCode('');
      } else {
        setCodes(result.recoveryCodes);
      }
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />;

  if (!setup) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {required
            ? 'This store requires two-factor sign-in and your account has not set it up. '
            : ''}
          You will need an authenticator app, such as the iPhone Passwords app, 1Password or
          Google Authenticator.
        </p>
        <ErrorNote message={error} />
        <Button type="button" className="w-full" disabled={busy} onClick={begin}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Set up authenticator
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add this key to your authenticator app as a time-based code, then enter the code it shows.
      </p>
      <p className="break-all rounded-md bg-muted p-3 font-mono text-sm select-all">
        {setup.secret.match(/.{1,4}/g)?.join(' ')}
      </p>
      <p className="text-sm">
        <a href={setup.uri} className="underline">
          Open in an authenticator app on this device
        </a>
      </p>
      <CodeInput id="totp-confirm" label="Code from the app" value={code} onChange={setCode} />
      <ErrorNote message={error} />
      <SubmitButton busy={busy}>Confirm</SubmitButton>
      {onCancel && (
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </form>
  );
}
