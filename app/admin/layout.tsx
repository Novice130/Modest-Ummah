'use client';

import { usePathname } from 'next/navigation';
import AdminNav from '@/components/admin/admin-nav';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Login page layout (no sidebar)
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // Dashboard layout — middleware already enforces admin auth
  return (
    <div className="flex h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50 bg-background">
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
