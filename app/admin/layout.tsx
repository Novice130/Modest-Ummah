'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isAdmin } from '@/lib/pocketbase';
import AdminNav from '@/components/admin/admin-nav';
import { Loader2 } from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // Skip check on login page
    if (pathname === '/admin/login') {
      setAuthorized(true);
      return;
    }

    const adminCheck = isAdmin();
    console.log('Admin Check:', adminCheck); // Debug log
    if (!adminCheck) {
      // Don't auto-redirect to avoid loops, just show unauthorized state
      setAuthorized(false);
    } else {
      setAuthorized(true);
    }
  }, [pathname, router]);

  if (!authorized) {
    if (pathname === '/admin/login') return <>{children}</>;
    
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <div className="text-destructive font-bold text-xl">Access Denied</div>
        <p className="text-muted-foreground">Your admin session has expired or is invalid.</p>
        <button 
          onClick={() => router.push('/admin/login')}
          className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
        >
          Go to Login
        </button>
      </div>
    );
  }

  // Login page layout (no sidebar)
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // Dashboard layout
  return (
    <div className="flex h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50">
        <AdminNav />
      </aside>
      <main className="flex-1 md:pl-64">
        <div className="h-full overflow-y-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
