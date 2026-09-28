'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { adminSignIn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

/**
 * Only same-origin paths are honoured. An absolute URL here would turn the
 * login page into an open redirect, and a signed-in admin is exactly the
 * target worth aiming one at.
 */
function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/admin';
  return value;
}

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get('redirect'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await adminSignIn(email.trim(), password);

      if (result && 'error' in result) {
        setError(result.error);
        setLoading(false);
        return;
      }

      router.push(redirectTo);
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      if (window.location.pathname === '/admin/login') {
         setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="w-full max-w-md p-8 bg-background border rounded-lg shadow-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mx-auto mb-3">
            <img src="/images/logo.png" alt="Modest Ummah" className="w-16 h-16 mx-auto rounded-full shadow-md ring-1 ring-border/50" />
          </Link>
          <h1 className="text-2xl font-bold font-heading">Admin Access</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Secure login for Modest Ummah staff
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Admin Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@modestummah.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Authenticating...
              </>
            ) : (
              'Sign In'
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-primary">
            ← Back to Store
          </Link>
        </div>
      </div>
    </div>
  );
}

// useSearchParams needs a Suspense boundary to keep the route from opting the
// whole page into client-side rendering.
export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}
