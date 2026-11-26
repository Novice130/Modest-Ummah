'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { LayoutDashboard, ShoppingBag, Package, Users, Settings, LogOut, TicketPercent, FolderTree, Tags, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/lib/actions/auth.actions';

// Ordered like a store admin's daily workflow: orders first, then catalogue,
// then people and promotions.
const navItems = [
  { title: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { title: 'Orders', href: '/admin/orders', icon: Package },
  { title: 'Products', href: '/admin/products', icon: ShoppingBag },
  { title: 'Categories', href: '/admin/categories', icon: FolderTree },
  { title: 'Tags', href: '/admin/tags', icon: Tags },
  { title: 'Customers', href: '/admin/customers', icon: Users },
  { title: 'Coupons', href: '/admin/coupons', icon: TicketPercent },
  { title: 'Settings', href: '/admin/settings', icon: Settings },
];

export default function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutAction(true);
    } finally {
      // Full navigation, not router.push: it discards the client router
      // cache, so Back cannot show admin pages rendered before sign-out.
      window.location.replace('/admin/login');
    }
  };

  return (
    <div className="flex flex-col h-full border-r bg-background">
      <div className="p-6">
        <Link href="/admin/dashboard" className="flex items-center gap-2" onClick={onNavigate}>
          <span className="font-heading font-bold text-xl">
            <span className="text-primary">Modest</span> Ummah
          </span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t space-y-1">
        <Button variant="ghost" className="w-full justify-start text-muted-foreground" asChild>
          <a href="/" target="_blank" rel="noopener noreferrer" onClick={onNavigate}>
            <ExternalLink className="mr-2 h-4 w-4" />
            View Store
          </a>
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-destructive"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="mr-2 h-4 w-4" />
          )}
          Sign Out
        </Button>
      </div>
    </div>
  );
}
