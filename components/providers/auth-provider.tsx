'use client';

import { useEffect, ReactNode } from 'react';
import { useAuthStore } from '@/lib/store';
import { getPocketBase, getCurrentUser } from '@/lib/api';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const initAuth = async () => {
      try {
        const pb = getPocketBase();

        if (pb.authStore.isValid) {
          const user = getCurrentUser();
          setUser(user);
          // Set cookie for potential SSR usage
          document.cookie = pb.authStore.exportToCookie({ httpOnly: false, path: '/' });
        } else {
          setUser(null);
          // Clear cookie
          document.cookie = 'auth_token=; path=/; max-age=0';
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setUser(null);
      }
    };

    initAuth();

    // Listen for auth changes
    const pb = getPocketBase();
    const unsubscribe = pb.authStore.onChange(() => {
      const user = getCurrentUser();
      setUser(user);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [setUser, setLoading]);

  return <>{children}</>;
}
