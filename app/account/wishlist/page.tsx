'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Heart, ChevronLeft, Trash2, ShoppingCart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import ProductCard from '@/components/product/product-card';
import { useAuthStore, useCartStore } from '@/lib/store';
import { getPocketBase } from '@/lib/pocketbase';
import type { Product } from '@/types';

export default function WishlistPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { addItem, openCart } = useCartStore();
  const [isLoading, setIsLoading] = useState(true);
  const [wishlist, setWishlist] = useState<Product[]>([]);

  useEffect(() => {
    const checkAuth = async () => {
      const pb = getPocketBase();
      
      if (!pb.authStore.isValid) {
        router.push('/auth/login?redirect=/account/wishlist');
        return;
      }

      // TODO: Load wishlist from PocketBase when wishlist collection is added
      // For now, using localStorage as fallback
      try {
        const savedWishlist = localStorage.getItem('modest-ummah-wishlist');
        if (savedWishlist) {
          setWishlist(JSON.parse(savedWishlist));
        }
      } catch (error) {
        console.error('Error loading wishlist:', error);
      }

      setIsLoading(false);
    };

    checkAuth();
  }, [router]);

  const removeFromWishlist = (productId: string) => {
    const updated = wishlist.filter(p => p.id !== productId);
    setWishlist(updated);
    localStorage.setItem('modest-ummah-wishlist', JSON.stringify(updated));
  };

  const addToCart = (product: Product) => {
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      color: product.colors?.[0]?.name,
      size: product.sizes?.[0],
      image: product.images?.[0],
    });
    openCart();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sage-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container-custom py-8">
        <Link href="/account" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Account
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-heading text-3xl mb-2">My Wishlist</h1>
            <p className="text-muted-foreground">
              {wishlist.length} {wishlist.length === 1 ? 'item' : 'items'} saved
            </p>
          </div>
        </div>

        {wishlist.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="font-heading text-xl mb-2">Your wishlist is empty</h2>
              <p className="text-muted-foreground mb-6">
                Start adding items you love to your wishlist
              </p>
              <Button asChild>
                <Link href="/shop">Browse Products</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {wishlist.map((product, index) => (
              <div key={product.id} className="relative group">
                <ProductCard product={product} index={index} />
                <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8"
                    onClick={() => removeFromWishlist(product.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8"
                    onClick={() => addToCart(product)}
                  >
                    <ShoppingCart className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
