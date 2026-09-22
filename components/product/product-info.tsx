'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag,
  Zap,
  Heart,
  Share2,
  Truck,
  RotateCcw,
  ShieldCheck,
  Minus,
  Plus,
  Check,
} from 'lucide-react';
import { SurfaceCard } from '@/components/ui/surface-card';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useCartStore, useWishlistStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { formatPrice, cn, getImageUrl } from '@/lib/utils';
import type { Product } from '@/types';

interface ProductInfoProps {
  product: Product;
}

export default function ProductInfo({ product }: ProductInfoProps) {
  const router = useRouter();
  const [selectedColor, setSelectedColor] = useState(product.colors?.[0]?.name || '');
  const [selectedSize, setSelectedSize] = useState(
    product.sizes?.length === 1 ? product.sizes[0] : ''
  );
  const [quantity, setQuantity] = useState(1);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  const { addItem, openCart } = useCartStore();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlistStore();
  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

  const isSaved = mounted ? isInWishlist(product.id) : false;

  const discount =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
      : null;

  const handleAddToCart = ({ checkout = false }: { checkout?: boolean } = {}) => {
    if (product.sizes?.length > 0 && !product.sizes.includes('One Size') && !selectedSize) {
      toast({
        title: 'Please select a size',
        description: 'Choose a size before proceeding.',
        variant: 'destructive',
      });
      return;
    }

    const firstImage = product.images?.[0];
    const imageSrc = firstImage ? getImageUrl(firstImage) : undefined;

    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity,
      color: selectedColor || undefined,
      size: selectedSize || undefined,
      image: imageSrc,
    });

    if (checkout) {
      router.push('/checkout');
      return;
    }

    toast({
      title: 'Added to cart!',
      description: `${product.name} has been added to your bag.`,
    });

    openCart();
  };

  const handleToggleWishlist = () => {
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
        description: `${product.name} added to your favorites.`,
      });
    }
  };

  const handleShare = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast({
        title: 'Link copied',
        description: 'Product link copied to clipboard.',
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <SurfaceCard className="p-6 md:p-8 space-y-6 bg-card">
      {/* Top Meta Line */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="uppercase tracking-wider font-semibold">
          {product.category?.name ?? 'Modest Ummah'}
        </span>
        {product.sku && <span>SKU: {product.sku}</span>}
      </div>

      {/* Title */}
      <h1 className="font-heading text-2xl sm:text-3xl text-foreground font-semibold leading-tight">
        {product.name}
      </h1>

      {/* Price Section */}
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <span
          className={`text-3xl font-bold tracking-tight ${
            discount ? 'text-[#2E7D5B] dark:text-[#5FBE92]' : 'text-foreground'
          }`}
        >
          {formatPrice(product.price)}
        </span>
        {product.compareAtPrice && product.compareAtPrice > product.price && (
          <span className="text-base text-muted-foreground line-through font-normal">
            {formatPrice(product.compareAtPrice)}
          </span>
        )}
        {discount && discount > 0 && (
          <span className="bg-[#2E7D5B] dark:bg-[#5FBE92] text-white text-xs font-bold px-2.5 py-1 rounded-[5px]">
            Save {discount}%
          </span>
        )}
      </div>

      {/* Stock availability */}
      <div className="flex items-center gap-2 text-xs">
        {product.inStock ? (
          <>
            <span className="w-2 h-2 rounded-full bg-[#2E7D5B] dark:bg-[#5FBE92]" />
            <span className="font-medium text-[#2E7D5B] dark:text-[#5FBE92]">
              In Stock & Ready to Ship
            </span>
            {product.stockQuantity && product.stockQuantity <= 5 && (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                — Only {product.stockQuantity} left!
              </span>
            )}
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="font-medium text-red-500">Currently Sold Out</span>
          </>
        )}
      </div>

      {/* Color Selection */}
      {product.colors && product.colors.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">Color</span>
            <span className="text-muted-foreground">{selectedColor}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {product.colors.map((color) => (
              <button
                key={color.name}
                type="button"
                onClick={() => setSelectedColor(color.name)}
                className={cn(
                  'w-8 h-8 rounded-full border-2 transition-all relative',
                  selectedColor === color.name
                    ? 'border-foreground ring-2 ring-foreground/20 ring-offset-2'
                    : 'border-black/[0.15] dark:border-white/[0.2] hover:scale-105'
                )}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
        </div>
      )}

      {/* Size Selection */}
      {product.sizes &&
        product.sizes.length > 0 &&
        !product.sizes.includes('One Size') && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">Size</span>
              {selectedSize && <span className="text-muted-foreground">{selectedSize}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {product.sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSelectedSize(size)}
                  className={cn(
                    'px-4 py-2 rounded-full text-xs font-semibold border transition-all',
                    selectedSize === size
                      ? 'bg-foreground text-background border-foreground shadow-xs'
                      : 'bg-card text-foreground border-black/[0.1] dark:border-white/[0.15] hover:bg-muted'
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Quantity Stepper */}
      <div className="space-y-2.5">
        <span className="text-xs font-semibold text-foreground">Quantity</span>
        <div className="flex items-center border border-black/[0.1] dark:border-white/[0.15] rounded-full w-fit bg-card px-1 py-0.5">
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="p-1.5 hover:bg-muted rounded-full transition-colors"
            aria-label="Decrease quantity"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center text-xs font-bold">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity(quantity + 1)}
            className="p-1.5 hover:bg-muted rounded-full transition-colors"
            aria-label="Increase quantity"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Dual Side-by-Side Action Buttons (Add to Cart + Buy It Now) */}
      <div className="space-y-3 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Add to Cart - Outlined Pill */}
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() => handleAddToCart({ checkout: false })}
            disabled={!product.inStock}
            className="h-12 rounded-full font-semibold border-2 border-foreground hover:bg-foreground hover:text-background transition-all"
          >
            <ShoppingBag className="h-4 w-4 mr-2" />
            Add to Bag
          </Button>

          {/* Buy It Now - Filled Primary Pill */}
          <Button
            type="button"
            size="lg"
            onClick={() => handleAddToCart({ checkout: true })}
            disabled={!product.inStock}
            className="h-12 rounded-full font-semibold bg-foreground text-background hover:bg-foreground/90 shadow-sm transition-all"
          >
            <Zap className="h-4 w-4 mr-2 fill-current" />
            Buy It Now
          </Button>
        </div>

        {/* Favorite & Share secondary row */}
        <div className="flex gap-2 justify-center pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleToggleWishlist}
            className="rounded-full text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Heart
              className={cn(
                'h-3.5 w-3.5 mr-1.5',
                isSaved ? 'fill-red-500 text-red-500' : 'text-current'
              )}
            />
            {isSaved ? 'Saved in Wishlist' : 'Add to Wishlist'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleShare}
            className="rounded-full text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 mr-1.5 text-green-600" />
            ) : (
              <Share2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            {copied ? 'Link Copied' : 'Share Item'}
          </Button>
        </div>
      </div>

      {/* Etsy Trust / Meta Strip */}
      <div className="grid grid-cols-3 gap-2 py-4 border-y border-black/[0.06] dark:border-white/[0.08] text-center">
        <div className="flex flex-col items-center gap-1.5 p-1">
          <Truck className="h-4 w-4 text-[#2E7D5B] dark:text-[#5FBE92]" />
          <span className="text-[11px] font-semibold text-foreground">Free Shipping</span>
          <span className="text-[10px] text-muted-foreground">Orders over $75</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 p-1 border-x border-black/[0.06] dark:border-white/[0.08]">
          <RotateCcw className="h-4 w-4 text-[#2E7D5B] dark:text-[#5FBE92]" />
          <span className="text-[11px] font-semibold text-foreground">30-Day Returns</span>
          <span className="text-[10px] text-muted-foreground">Hassle-free guarantee</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 p-1">
          <ShieldCheck className="h-4 w-4 text-[#2E7D5B] dark:text-[#5FBE92]" />
          <span className="text-[11px] font-semibold text-foreground">Secure Checkout</span>
          <span className="text-[10px] text-muted-foreground">Apple-grade Stripe</span>
        </div>
      </div>

      {/* Expandable Accordion Panels */}
      <Accordion type="single" collapsible defaultValue="description" className="w-full">
        {/* Item Details */}
        <AccordionItem value="description" className="border-black/[0.06] dark:border-white/[0.08]">
          <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
            Item Details
          </AccordionTrigger>
          <AccordionContent className="text-xs sm:text-sm text-muted-foreground leading-relaxed pt-1 space-y-2">
            {product.description ? (
              <p>{product.description}</p>
            ) : (
              <p>{product.shortDescription || 'Crafted with premium cubic zirconia and fine craftsmanship.'}</p>
            )}
            {product.shortDescription && product.description && (
              <p className="font-medium text-foreground">{product.shortDescription}</p>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Shipping & Policies */}
        <AccordionItem value="shipping" className="border-black/[0.06] dark:border-white/[0.08]">
          <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
            Shipping & Return Policies
          </AccordionTrigger>
          <AccordionContent className="text-xs sm:text-sm text-muted-foreground leading-relaxed pt-1 space-y-2">
            <p>
              • <strong>Dispatch:</strong> Dispatched in 1-2 business days with tracking.
            </p>
            <p>
              • <strong>Packaging:</strong> Shipped in our signature luxury presentation box.
            </p>
            <p>
              • <strong>Returns:</strong> 30-day returns accepted on unworn pieces in original packaging.
            </p>
          </AccordionContent>
        </AccordionItem>

        {/* About Modest Ummah */}
        <AccordionItem value="about" className="border-black/[0.06] dark:border-white/[0.08]">
          <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
            About Modest Ummah
          </AccordionTrigger>
          <AccordionContent className="text-xs sm:text-sm text-muted-foreground leading-relaxed pt-1">
            Modest Ummah specializes in timeless cubic-zirconia bridal and occasion jewellery, handcrafted abayas, and modest wear honoring tradition and modern elegance.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </SurfaceCard>
  );
}
