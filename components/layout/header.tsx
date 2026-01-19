'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ShoppingBag,
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
import { useCartStore, useUIStore, useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Home', href: '/' },
  {
    name: 'Men',
    href: '/shop/men',
    submenu: [
      { name: 'All Men', href: '/shop/men' },
      { name: 'Thobes', href: '/shop/men/thobes' },
      { name: 'Kurtas', href: '/shop/men/kurtas' },
      { name: 'Jubbas', href: '/shop/men/jubbas' },
      { name: 'Caps/Kufis', href: '/shop/men/kufis' },
      { name: 'Pants', href: '/shop/men/pants' },
    ],
  },
  {
    name: 'Women',
    href: '/shop/women',
    submenu: [
      { name: 'All Women', href: '/shop/women' },
      { name: 'Abayas', href: '/shop/women/abayas' },
      { name: 'Hijabs', href: '/shop/women/hijabs' },
      { name: 'Khimars', href: '/shop/women/khimars' },
      { name: 'Jilbabs', href: '/shop/women/jilbabs' },
      { name: 'Dresses', href: '/shop/women/dresses' },
    ],
  },
  {
    name: 'Accessories',
    href: '/shop/accessories',
    submenu: [
      { name: 'All Accessories', href: '/shop/accessories' },
      { name: 'Miswak', href: '/shop/accessories/miswak' },
      { name: 'Attar/Perfumes', href: '/shop/accessories/attar' },
      { name: 'Prayer Mats', href: '/shop/accessories/prayer-mats' },
      { name: 'Tasbeeh', href: '/shop/accessories/tasbeeh' },
      { name: 'Bags', href: '/shop/accessories/bags' },
    ],
  },
];

export default function Header() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { getItemCount, openCart } = useCartStore();
  const { isMobileMenuOpen, toggleMobileMenu, closeMobileMenu, isSearchOpen, toggleSearch, closeSearch } = useUIStore();
  const { user } = useAuthStore();
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  const itemCount = getItemCount();

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
        'sticky top-0 z-50 w-full transition-all duration-300',
        isScrolled
          ? 'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm'
          : 'bg-background'
      )}
    >
      {/* Announcement Bar */}
      <div className="bg-navy-900 text-white text-center py-2 text-sm">
        <p>Free Shipping on Orders Over $75 | Use Code: TAYYIB10 for 10% Off</p>
      </div>

      <div className="container-custom">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 hover:bg-muted rounded-md"
            onClick={toggleMobileMenu}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>

          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-heading text-xl md:text-2xl font-bold text-navy-900 dark:text-white">
              Modest Ummah
            </span>
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
                    'flex items-center space-x-1 py-2 text-sm font-medium transition-colors link-hover',
                    pathname === item.href || pathname.startsWith(item.href + '/')
                      ? 'text-sage-500'
                      : 'text-foreground'
                  )}
                >
                  <span>{item.name}</span>
                  {item.submenu && <ChevronDown className="h-4 w-4" />}
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

            {/* User */}
            <Link href={user ? '/account' : '/auth/login'}>
              <Button variant="ghost" size="icon" aria-label="Account">
                <User className="h-5 w-5" />
              </Button>
            </Link>

            {/* Cart */}
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={openCart}
              aria-label="Cart"
            >
              <ShoppingBag className="h-5 w-5" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-300 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
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
