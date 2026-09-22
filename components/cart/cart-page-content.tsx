'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Minus, Plus, Trash2, ArrowRight, ShoppingBag, ShieldCheck, Truck } from 'lucide-react';
import { SurfaceCard } from '@/components/ui/surface-card';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/lib/store';
import { formatPrice, getValidImageSrc } from '@/lib/utils';

export default function CartPageContent() {
  const { items, removeItem, updateQuantity, getSubtotal } = useCartStore();

  const subtotal = getSubtotal();
  const freeShippingThreshold = 75;
  const shipping = subtotal >= freeShippingThreshold ? 0 : 9.99;
  const progressPercent = Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100));
  const amountToFree = (freeShippingThreshold - subtotal).toFixed(2);

  if (items.length === 0) {
    return (
      <SurfaceCard className="text-center py-16 px-4 max-w-md mx-auto bg-card">
        <div className="w-16 h-16 rounded-full bg-muted/40 mx-auto flex items-center justify-center mb-4 text-muted-foreground">
          <ShoppingBag className="h-8 w-8" />
        </div>
        <h2 className="font-heading text-xl font-semibold mb-1 text-foreground">Your bag is empty</h2>
        <p className="text-xs text-muted-foreground mb-6">
          Explore our pieces and save your favorites to your bag.
        </p>
        <Button asChild className="rounded-full px-6 font-semibold bg-foreground text-background hover:bg-foreground/90">
          <Link href="/shop">Start Shopping</Link>
        </Button>
      </SurfaceCard>
    );
  }

  return (
    <div className="grid lg:grid-cols-3 gap-8 items-start">
      {/* Cart Items List */}
      <div className="lg:col-span-2 space-y-4">
        {/* Free Shipping Progress Strip */}
        <SurfaceCard className="p-4 bg-card border border-black/[0.08] dark:border-white/[0.12]">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground mb-2">
            <Truck className="w-4 h-4 text-[#2E7D5B] dark:text-[#5FBE92]" />
            {subtotal >= freeShippingThreshold ? (
              <span className="text-[#2E7D5B] dark:text-[#5FBE92]">
                You&apos;ve unlocked free standard shipping!
              </span>
            ) : (
              <span>
                Add <span className="text-foreground font-bold">${amountToFree}</span> more for free shipping
              </span>
            )}
          </div>
          <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden">
            <div
              className="bg-[#2E7D5B] dark:bg-[#5FBE92] h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </SurfaceCard>

        {/* Individual Item Panels */}
        {items.map((item) => (
          <SurfaceCard
            key={`${item.productId}-${item.color}-${item.size}`}
            className="p-4 bg-card border border-black/[0.08] dark:border-white/[0.12]"
          >
            <div className="flex gap-4">
              {/* Product Thumbnail in 4:5 frame */}
              <div className="relative w-20 sm:w-24 aspect-[4/5] bg-muted/30 rounded-xl overflow-hidden shrink-0 border border-black/[0.06] dark:border-white/[0.08]">
                {getValidImageSrc(item.image) ? (
                  <Image
                    src={getValidImageSrc(item.image)!}
                    alt={item.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <ShoppingBag className="h-6 w-6" />
                  </div>
                )}
              </div>

              {/* Item Details */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <Link
                      href={`/product/${item.productId}`}
                      className="font-medium text-sm sm:text-base text-foreground hover:opacity-80 transition-opacity line-clamp-2"
                    >
                      {item.name}
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId, item.color, item.size)}
                      className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {(item.color || item.size) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.color && <span>{item.color}</span>}
                      {item.color && item.size && <span> • </span>}
                      {item.size && <span>{item.size}</span>}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-black/[0.04] dark:border-white/[0.06]">
                  {/* Quantity Stepper Pill */}
                  <div className="flex items-center border border-black/[0.1] dark:border-white/[0.15] rounded-full bg-card px-1 py-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(
                          item.productId,
                          item.quantity - 1,
                          item.color,
                          item.size
                        )
                      }
                      className="p-1 hover:bg-muted rounded-full transition-colors"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-8 text-center text-xs font-bold">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(
                          item.productId,
                          item.quantity + 1,
                          item.color,
                          item.size
                        )
                      }
                      className="p-1 hover:bg-muted rounded-full transition-colors"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Line Total */}
                  <div className="text-right">
                    <span className="font-bold text-sm sm:text-base text-foreground">
                      {formatPrice(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </SurfaceCard>
        ))}
      </div>

      {/* Order Summary SurfaceCard */}
      <div className="lg:sticky lg:top-24 h-fit">
        <SurfaceCard className="p-6 space-y-5 bg-card border border-black/[0.08] dark:border-white/[0.12]">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            Order Summary
          </h2>

          <div className="space-y-3 text-xs sm:text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</span>
              <span className="font-medium text-foreground">{formatPrice(subtotal)}</span>
            </div>

            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span>
                {shipping === 0 ? (
                  <span className="text-[#2E7D5B] dark:text-[#5FBE92] font-semibold">FREE</span>
                ) : (
                  formatPrice(shipping)
                )}
              </span>
            </div>

            <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex justify-between items-baseline">
              <span className="font-bold text-base text-foreground">Estimated Total</span>
              <span className="font-bold text-xl text-foreground">
                {formatPrice(subtotal + shipping)}
              </span>
            </div>
          </div>

          <Button
            asChild
            size="lg"
            className="w-full rounded-full h-12 font-semibold bg-foreground text-background hover:bg-foreground/90 shadow-sm"
          >
            <Link href="/checkout">
              Proceed to Checkout <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>

          <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground pt-1">
            <ShieldCheck className="h-3.5 w-3.5 text-[#2E7D5B] dark:text-[#5FBE92]" />
            <span>Secure checkout encrypted with 256-bit SSL</span>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
