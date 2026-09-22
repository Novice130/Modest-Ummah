'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ShoppingBag,
  Heart,
  User,
  Menu,
  X,
  Sun,
  Moon,
  ChevronDown,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCartStore, useUIStore, useAuthStore, useWishlistStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { CategoryNode } from '@/types';

interface NavItem {
  name: string;
  href: string;
  submenu?: Array<{ name: string; href: string }>;
}

/**
 * Builds the nav from the editable category tree. Top-level categories become
 * nav items and their children become the submenu, so adding a category in
 * the admin puts it in the header without a deploy.
 */
function buildNavigation(categories: CategoryNode[]): NavItem[] {
  return [
    { name: 'Home', href: '/' },
    ...categories.map((parent) => ({
      name: parent.name,
      href: `/shop/${parent.slug}`,
      submenu:
        parent.children.length > 0
          ? [
              { name: `All ${parent.name}`, href: `/shop/${parent.slug}` },
              ...parent.children.map((child) => ({
                name: child.name,
                href: `/shop/${child.slug}`,
              })),
            ]
          : undefined,
    })),
  ];
}

export default function Header({ categories = [] }: { categories?: CategoryNode[] }) {
  const navigation = useMemo(() => buildNavigation(categories), [categories]);
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { getItemCount, openCart } = useCartStore();
  const wishlistItems = useWishlistStore((state) => state.items);
  const { isMobileMenuOpen, toggleMobileMenu, closeMobileMenu, isSearchOpen, toggleSearch, closeSearch } = useUIStore();
  const { user } = useAuthStore();
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by only showing counts after mount
  const itemCount = mounted ? getItemCount() : 0;
  const wishlistCount = mounted ? wishlistItems.length : 0;

  // Set mounted state after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    closeMobileMenu();
    closeSearch();
  }, [pathname, closeMobileMenu, closeSearch]);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300 border-b border-black/[0.06] dark:border-white/[0.08]',
        isScrolled
          ? 'bg-card/95 backdrop-blur-md shadow-xs'
          : 'bg-card/85 backdrop-blur-xs'
      )}
    >
      {/* Announcement Bar */}
      <div className="bg-[#141414] dark:bg-[#1A1A1A] text-white text-center py-2 text-[11px] sm:text-xs tracking-wider uppercase font-medium">
        <p>Free Shipping on Orders Over $75 • 30-Day Returns</p>
      </div>

      <div className="container-custom">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 hover:bg-muted rounded-full"
            onClick={toggleMobileMenu}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <img src="/images/logo.png" alt="Modest Ummah" className="h-7 sm:h-8 md:h-10 w-auto" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {navigation.map((item) => (
              <div
                key={item.name}
                className="relative group"
                onMouseEnter={() => item.submenu && setActiveSubmenu(item.name)}
                onMouseLeave={() => setActiveSubmenu(null)}
              >
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center space-x-1 py-2 text-xs uppercase tracking-wider font-semibold transition-colors',
                    pathname === item.href || pathname.startsWith(item.href + '/')
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span>{item.name}</span>
                  {item.submenu && <ChevronDown className="h-3.5 w-3.5 opacity-60" />}
                </Link>

                {/* Submenu */}
                {item.submenu && (
                  <AnimatePresence>
                    {activeSubmenu === item.name && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-full left-0 w-48 bg-background border rounded-md shadow-lg py-2"
                      >
                        {item.submenu.map((subItem) => (
                          <Link
                            key={subItem.name}
                            href={subItem.href}
                            className="block px-4 py-2 text-sm hover:bg-muted transition-colors"
                          >
                            {subItem.name}
                          </Link>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center space-x-2 md:space-x-4">
            {/* Search */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSearch}
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </Button>

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>

            {/* Wishlist */}
            <Link href="/account/wishlist" className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="w-9 h-9 rounded-full hover:bg-muted"
                aria-label="Wishlist"
              >
                <Heart className="h-4.5 w-4.5" />
                {wishlistCount > 0 && (
                  <span className="absolute 0 top-0.5 right-0.5 bg-[#B3261E] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                    {wishlistCount}
                  </span>
                )}
              </Button>
            </Link>

            {/* User */}
            <Link href={user ? '/account' : '/auth/login'}>
              <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full hover:bg-muted" aria-label="Account">
                <User className="h-4.5 w-4.5" />
              </Button>
            </Link>

            {/* Cart */}
            <Button
              variant="ghost"
              size="icon"
              className="relative w-9 h-9 rounded-full hover:bg-muted"
              onClick={openCart}
              aria-label="Shopping Bag"
            >
              <ShoppingBag className="h-4.5 w-4.5" />
              {itemCount > 0 && (
                <span className="absolute top-0.5 right-0.5 bg-foreground text-background text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                  {itemCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Search Overlay */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t bg-background"
          >
            <div className="container-custom py-4">
              <form action="/shop" method="GET" className="flex gap-2">
                <Input
                  type="search"
                  name="search"
                  placeholder="Search for products..."
                  className="flex-1"
                  autoFocus
                />
                <Button type="submit">Search</Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: '-100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 top-[calc(2rem+4rem)] bg-background z-40 md:hidden overflow-y-auto"
          >
            <nav className="container-custom py-6 space-y-4">
              {navigation.map((item) => (
                <div key={item.name} className="space-y-2">
                  <Link
                    href={item.href}
                    className={cn(
                      'block text-lg font-medium py-2',
                      pathname === item.href ? 'text-sage-500' : 'text-foreground'
                    )}
                  >
                    {item.name}
                  </Link>
                  {item.submenu && (
                    <div className="pl-4 space-y-2">
                      {item.submenu.map((subItem) => (
                        <Link
                          key={subItem.name}
                          href={subItem.href}
                          className="block text-sm text-muted-foreground hover:text-foreground py-1"
                        >
                          {subItem.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
