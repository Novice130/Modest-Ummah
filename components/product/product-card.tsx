'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, ShoppingBag } from 'lucide-react';
import { SurfaceCard } from '@/components/ui/surface-card';
import { Button } from '@/components/ui/button';
import { useCartStore, useWishlistStore } from '@/lib/store';
import { formatPrice, getImageUrl } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/types';

interface ProductCardProps {
  product: Product;
  index?: number;
}

function getProductImageSrc(product: Product): string | null {
  const firstImage: any = product.images?.[0];
  if (!firstImage) return null;
  return getImageUrl(firstImage);
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addItem, openCart } = useCartStore();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isSaved = mounted ? isInWishlist(product.id) : false;

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isSaved) {
      removeFromWishlist(product.id);
      toast({
        title: 'Removed from wishlist',
        description: `${product.name} removed from your saved pieces.`,
      });
    } else {
      addToWishlist(product.id);
      toast({
        title: 'Saved to wishlist',
        description: `${product.name} has been added to your favorites.`,
      });
    }
  };

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const imageSrc = getProductImageSrc(product);

    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      color: product.colors?.[0]?.name,
      size: product.sizes?.[0],
      image: imageSrc || undefined,
    });

    toast({
      title: 'Added to cart',
      description: `${product.name} has been added to your bag.`,
    });

    openCart();
  };

  const discount =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
      : null;

  const imageSrc = getProductImageSrc(product);
  const isBlobUrl = imageSrc?.startsWith('blob:');

  return (
    <SurfaceCard
      hoverEffect
      className="group relative flex flex-col h-full bg-card transition-all duration-300"
    >
      {/* Photo Container - 4:5 aspect ratio matching Etsy phone app */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted/30">
        <Link href={`/product/${product.slug || product.id}`} className="absolute inset-0 block">
          {imageSrc ? (
            isBlobUrl ? (
              <img
                src={imageSrc}
                alt={product.name}
                className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
            ) : (
              <Image
                src={imageSrc}
                alt={product.name}
                fill
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-muted/40">
              <span className="text-xs">No image</span>
            </div>
          )}
        </Link>

        {/* Floating Deal Badge (Etsy green) */}
        {discount && discount > 0 && (
          <div className="pointer-events-none absolute top-2.5 left-2.5 bg-[#2E7D5B] dark:bg-[#5FBE92] text-white px-2 py-0.5 rounded-[5px] text-[10px] sm:text-[11px] font-bold tracking-tight shadow-xs z-10">
            {discount}% off
          </div>
        )}

        {/* Floating Save / Favorite Heart Button */}
        <button
          type="button"
          onClick={handleToggleWishlist}
          aria-label={isSaved ? 'Remove from wishlist' : 'Save to wishlist'}
          className="absolute top-2.5 right-2.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/90 dark:bg-card/90 shadow-sm flex items-center justify-center text-foreground hover:text-red-500 transition-all hover:scale-110 active:scale-95 z-10"
        >
          <Heart
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${
              isSaved ? 'fill-[#B3261E] text-[#B3261E]' : 'text-foreground'
            }`}
          />
        </button>

        {/* Floating Sold Out Badge */}
        {!product.inStock && (
          <div className="pointer-events-none absolute bottom-2.5 left-2.5 bg-white/90 dark:bg-card/90 text-foreground text-[10px] font-semibold px-2 py-0.5 rounded-[5px] shadow-xs z-10">
            Sold out
          </div>
        )}

        {/* Quick Add Overlay on Desktop Hover */}
        {product.inStock && (
          <div className="absolute bottom-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 hidden sm:block">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleQuickAdd}
              className="h-8 rounded-full px-3 shadow-md bg-white/95 dark:bg-card/95 hover:bg-white text-xs font-semibold"
            >
              <ShoppingBag className="w-3.5 h-3.5 mr-1" />
              Add
            </Button>
          </div>
        )}
      </div>

      {/* Product Details Body */}
      <Link
        href={`/product/${product.slug || product.id}`}
        className="p-3 sm:p-3.5 flex flex-col flex-1 justify-between gap-1 block"
      >
        <div>
          {/* Price Line (Bold price, green when on sale + strike-through compare price) */}
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-base sm:text-[17px] font-bold tracking-tight ${
                discount ? 'text-[#2E7D5B] dark:text-[#5FBE92]' : 'text-foreground'
              }`}
            >
              {formatPrice(product.price)}
            </span>
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <span className="text-xs text-muted-foreground line-through font-normal">
                {formatPrice(product.compareAtPrice)}
              </span>
            )}
          </div>

          {/* Product Title */}
          <h3 className="text-xs sm:text-sm font-normal text-foreground line-clamp-2 leading-snug mt-1 group-hover:opacity-80 transition-opacity">
            {product.name}
          </h3>
        </div>

        {/* Category Overline */}
        {product.category?.name && (
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mt-1 line-clamp-1">
            {product.category.name}
          </p>
        )}
      </Link>
    </SurfaceCard>
  );
}
