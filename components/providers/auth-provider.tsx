'use client';

import { useEffect, ReactNode } from 'react';
import { useAuthStore } from '@/lib/store';
import { getPocketBase, getCurrentUser } from '@/lib/pocketbase';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    // Initialize auth state from PocketBase
    const initAuth = async () => {
      try {
        const pb = getPocketBase();
        
        if (pb.authStore.isValid) {
          const user = getCurrentUser();
          setUser(user);
          // Force sync cookie to ensure middleware sees it
          document.cookie = pb.authStore.exportToCookie({ httpOnly: false, path: '/' });
        } else {
          setUser(null);
          // Clear cookie if invalid
          document.cookie = pb.authStore.exportToCookie({ httpOnly: false, path: '/' });
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setUser(null);
      }
    };

    initAuth();

    // Listen for auth changes
    const pb = getPocketBase();
    pb.authStore.onChange(() => {
      const user = getCurrentUser();
      setUser(user);
    });
  }, [setUser, setLoading]);

  return <>{children}</>;
}
