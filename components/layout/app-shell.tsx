'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import CartDrawer from '@/components/cart/cart-drawer';

/**
 * One-time cleanup for the stale next-pwa service worker. Returning
 * visitors still have an old precache worker controlling this origin and
 * serving years-old bundles; next-pwa is disabled for Next 16, so the
 * worker is unregistered rather than updated.
 */
function useUnregisterStaleServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      })
      .catch(() => {
        // Best-effort cleanup; a controlled unregister failure just leaves
        // the old worker in place until the next visit.
      });
  }, []);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  useUnregisterStaleServiceWorker();

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
    </>
  );
}
