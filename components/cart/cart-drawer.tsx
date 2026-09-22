'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, Trash2, ShoppingBag, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SurfaceCard } from '@/components/ui/surface-card';
import { useCartStore } from '@/lib/store';
import { formatPrice, getValidImageSrc } from '@/lib/utils';

export default function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, getSubtotal } = useCartStore();

  // Prevent body scroll when cart is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const subtotal = getSubtotal();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50"
            onClick={closeCart}
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-background border-l border-black/[0.08] dark:border-white/[0.12] z-50 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 px-5 border-b border-black/[0.06] dark:border-white/[0.08] bg-card/60">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-foreground" />
                <h2 className="font-heading text-base font-semibold text-foreground">
                  Shopping Bag ({items.reduce((s, i) => s + i.quantity, 0)})
                </h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 rounded-full hover:bg-muted"
                onClick={closeCart}
                aria-label="Close bag"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-card border border-black/[0.08] dark:border-white/[0.12] flex items-center justify-center mb-4 text-muted-foreground">
                    <ShoppingBag className="h-8 w-8" />
                  </div>
                  <h3 className="font-heading text-lg font-semibold mb-1 text-foreground">
                    Your bag is empty
                  </h3>
                  <p className="text-xs text-muted-foreground mb-6 max-w-xs">
                    Browse our jewellery and modest wear to add pieces to your bag.
                  </p>
                  <Button
                    onClick={closeCart}
                    asChild
                    className="rounded-full px-6 font-semibold bg-foreground text-background hover:bg-foreground/90"
                  >
                    <Link href="/shop">Start Shopping</Link>
                  </Button>
                </div>
              ) : (
                items.map((item, index) => (
                  <SurfaceCard
                    key={`${item.productId}-${item.color}-${item.size}`}
                    className="p-3 bg-card border border-black/[0.08] dark:border-white/[0.12]"
                  >
                    <div className="flex gap-3.5">
                      {/* Thumbnail in 4:5 frame */}
                      <div className="relative w-18 aspect-[4/5] bg-muted/30 rounded-lg overflow-hidden shrink-0 border border-black/[0.06] dark:border-white/[0.08]">
                        {getValidImageSrc(item.image) ? (
                          <Image
                            src={getValidImageSrc(item.image)!}
                            alt={item.name}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <ShoppingBag className="h-5 w-5" />
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start gap-1">
                            <h4 className="font-medium text-xs sm:text-sm text-foreground truncate">
                              {item.name}
                            </h4>
                            <button
                              type="button"
                              onClick={() => removeItem(item.productId, item.color, item.size)}
                              className="text-muted-foreground hover:text-red-500 transition-colors p-0.5"
                              aria-label="Remove item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {(item.color || item.size) && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {item.color && <span>{item.color}</span>}
                              {item.color && item.size && <span> • </span>}
                              {item.size && <span>{item.size}</span>}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-black/[0.04] dark:border-white/[0.06]">
                          {/* Quantity Stepper */}
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
                            <span className="w-6 text-center text-xs font-bold">
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

                          <span className="font-bold text-xs sm:text-sm text-foreground">
                            {formatPrice(item.price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </SurfaceCard>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="p-4 px-5 border-t border-black/[0.06] dark:border-white/[0.08] bg-card/80 backdrop-blur-xs space-y-3">
                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Subtotal
                  </span>
                  <span className="font-bold text-base text-foreground">
                    {formatPrice(subtotal)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={closeCart}
                    asChild
                    className="rounded-full h-11 text-xs font-semibold border-black/[0.15] dark:border-white/[0.2]"
                  >
                    <Link href="/cart">View Bag</Link>
                  </Button>
                  <Button
                    onClick={closeCart}
                    asChild
                    className="rounded-full h-11 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 shadow-sm"
                  >
                    <Link href="/checkout">
                      Checkout <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
