'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useCartStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import Script from 'next/script';

declare global {
  interface Window {
    google?: any;
    AppleID?: any;
  }
}

export default function SocialAuth() {
  const router = useRouter();
  const { toast } = useToast();
  const { setUser } = useAuthStore();
  const { syncWithServer } = useCartStore();
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'apple' | null>(null);

  const googleClientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    '488492087162-3gtbu198aonl52qckg9cdnk7s52l6c0a.apps.googleusercontent.com';

  const handleGoogleSuccess = async (response: any) => {
    setLoadingProvider('google');
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: response.credential }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Google sign-in failed');
      }

      setUser(data.record || data.user);
      if (data.record?.id || data.user?.id) {
        await syncWithServer(data.record?.id || data.user?.id);
      }

      toast({
        title: 'Welcome!',
        description: 'Successfully signed in with Google.',
      });

      router.refresh();
      router.push('/account');
    } catch (err: any) {
      toast({
        title: 'Sign in failed',
        description: err.message || 'Google sign-in failed',
        variant: 'destructive',
      });
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleAppleSignIn = async () => {
    if (!window.AppleID) {
      toast({
        title: 'Apple Sign-In',
        description: 'Apple sign-in is initializing. Please try again.',
      });
      return;
    }

    setLoadingProvider('apple');
    try {
      const data = await window.AppleID.auth.signIn();
      const identityToken = data.authorization?.id_token;
      const userObj = data.user;
      const name = userObj
        ? `${userObj.name?.firstName || ''} ${userObj.name?.lastName || ''}`.trim()
        : undefined;

      const res = await fetch('/api/auth/apple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityToken, name }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Apple sign-in failed');
      }

      setUser(resData.record || resData.user);
      if (resData.record?.id || resData.user?.id) {
        await syncWithServer(resData.record?.id || resData.user?.id);
      }

      toast({
        title: 'Welcome!',
        description: 'Successfully signed in with Apple.',
      });

      router.refresh();
      router.push('/account');
    } catch (err: any) {
      if (err.error !== 'popup_closed_by_user') {
        toast({
          title: 'Sign in failed',
          description: err.message || 'Apple sign-in failed',
          variant: 'destructive',
        });
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  const setupGoogle = () => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleSuccess,
      });

      const btnContainer = document.getElementById('google-btn-wrapper');
      if (btnContainer) {
        btnContainer.innerHTML = '';
        window.google.accounts.id.renderButton(btnContainer, {
          theme: 'outline',
          size: 'large',
          width: '100%',
          text: 'continue_with',
          shape: 'rectangular',
        });
      }
    }
  };

  const setupApple = () => {
    if (window.AppleID) {
      try {
        window.AppleID.auth.init({
          clientId: 'com.modestummah.web',
          scope: 'name email',
          redirectURI: typeof window !== 'undefined' ? `${window.location.origin}/auth/login` : '',
          usePopup: true,
        });
      } catch (_) {
        // Already initialized
      }
    }
  };

  useEffect(() => {
    setupGoogle();
    setupApple();
  }, []);

  return (
    <div className="space-y-3 w-full">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={setupGoogle}
      />
      <Script
        src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"
        strategy="afterInteractive"
        onLoad={setupApple}
      />

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/60" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div id="google-btn-wrapper" className="w-full min-h-[40px] flex justify-center" />

        <button
          type="button"
          onClick={handleAppleSignIn}
          disabled={loadingProvider !== null}
          className="w-full h-10 px-4 rounded-md bg-black text-white hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 text-sm font-medium shadow-sm disabled:opacity-50"
        >
          {loadingProvider === 'apple' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <svg className="h-4 w-4 fill-current" viewBox="0 0 170 170">
              <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.6-7.85-11.71-14.42-6.53-10.45-11.45-21.87-14.75-34.25-3.3-12.38-4.96-24.13-4.96-35.25 0-14.79 3.65-27.13 10.96-37.03 7.31-9.9 16.59-14.93 27.84-15.09 5.03 0 10.51 1.34 16.44 4.02 5.93 2.68 9.94 4.08 12.04 4.2 2.68-.45 6.84-1.96 12.48-4.53 5.64-2.57 10.63-3.8 14.97-3.69 11.28.67 20.35 4.69 27.21 12.06 6.86 7.37 11.16 16.31 12.91 26.81-10.05 6.03-15.08 14.52-15.08 25.47 0 9.05 3.51 16.86 10.53 23.43 7.02 6.57 15.42 10.28 25.21 11.13-2.12 7.04-4.8 13.97-8.03 20.8zM119.22 31.84c0-7.37 2.64-14.47 7.93-21.29 5.29-6.82 11.97-11.23 20.04-13.23.45 2.12.67 4.25.67 6.38 0 7.37-2.73 14.58-8.19 21.62-5.46 7.04-12.05 11.39-19.78 13.06-.23-2.23-.67-4.41-.67-6.54z" />
            </svg>
          )}
          Continue with Apple
        </button>
      </div>
    </div>
  );
}
