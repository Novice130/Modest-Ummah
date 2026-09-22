'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, ChevronLeft, Loader2, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SurfaceCard } from '@/components/ui/surface-card';
import ProductCard from '@/components/product/product-card';
import { useWishlistStore } from '@/lib/store';
import type { Product } from '@/types';

export default function WishlistPage() {
  const { items: savedIds, clearWishlist } = useWishlistStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (savedIds.length === 0) {
      setProducts([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    // Fetch catalogue to filter down saved pieces
    fetch('/api/v1/products?limit=100')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (cancelled) return;
        const allItems: Product[] = data.items || [];
        const matched = allItems.filter((p) => savedIds.includes(p.id) || savedIds.includes(p.slug));
        setProducts(matched);
      })
      .catch((err) => {
        console.error('Failed to load wishlist products:', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [savedIds, mounted]);

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-foreground opacity-40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container-custom py-8 md:py-12">
        <Link
          href="/shop"
          className="inline-flex items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground mb-6"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Continue Shopping
        </Link>

        <div className="flex items-end justify-between mb-8 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div>
            <span className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground">
              Saved Collection
            </span>
            <h1 className="font-heading text-2xl md:text-3xl text-foreground font-semibold mt-1">
              My Favorites
            </h1>
          </div>
          {products.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearWishlist}
              className="text-xs text-muted-foreground hover:text-red-500 rounded-full"
            >
              Clear All
            </Button>
          )}
        </div>

        {products.length === 0 ? (
          <SurfaceCard className="py-16 px-4 text-center max-w-md mx-auto bg-card">
            <div className="w-16 h-16 rounded-full bg-muted/40 mx-auto flex items-center justify-center mb-4 text-muted-foreground">
              <Heart className="h-7 w-7" />
            </div>
            <h2 className="font-heading text-xl font-semibold mb-1 text-foreground">
              Your wishlist is empty
            </h2>
            <p className="text-xs text-muted-foreground mb-6">
              Tap the heart icon on any piece you love to save it here for later.
            </p>
            <Button
              asChild
              className="rounded-full px-6 font-semibold bg-foreground text-background hover:bg-foreground/90"
            >
              <Link href="/shop">Browse Catalogue</Link>
            </Button>
          </SurfaceCard>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-5">
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
