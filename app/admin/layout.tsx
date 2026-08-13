'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import AdminNav from '@/components/admin/admin-nav';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Login page layout (no sidebar)
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // Single shell — middleware enforces admin auth. The nested
  // app/admin/dashboard/layout.tsx duplicate shell was deleted (6-A).
  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50 bg-background">
        <AdminNav />
      </aside>

      {/* Mobile top bar with drawer trigger */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open admin navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-heading font-bold">
          <span className="text-primary">Modest</span> Ummah
        </span>
      </header>

      <main className="flex-1 md:pl-64 pt-14 md:pt-0">
        <div className="h-full overflow-y-auto p-4 md:p-8">{children}</div>
      </main>

      {/* Mobile drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Admin navigation</SheetTitle>
          </SheetHeader>
          <AdminNav onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
