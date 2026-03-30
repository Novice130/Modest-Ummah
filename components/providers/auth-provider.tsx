'use client';

import { useEffect, ReactNode, useRef } from 'react';
import { useAuthStore } from '@/lib/store';
import type { User } from '@/types';

interface AuthProviderProps {
  children: ReactNode;
  initialUser: User | null;
}

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const { setUser, setLoading } = useAuthStore();
  const initialized = useRef(false);

  // Synchronously initialize the store directly on mount to prevent flash
  if (!initialized.current) {
    useAuthStore.setState({ user: initialUser, isLoading: false });
    initialized.current = true;
  }

  useEffect(() => {
    // If user changes via navigation, update the store
    if (initialized.current) {
      setUser(initialUser);
    }
  }, [initialUser, setUser]);

  return <>{children}</>;
}
