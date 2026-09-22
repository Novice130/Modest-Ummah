import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Minus, Plus, Trash2, ArrowRight, ShoppingBag } from 'lucide-react';
import CartPageContent from '@/components/cart/cart-page-content';

export const metadata: Metadata = {
  title: 'Shopping Cart',
  description: 'Review your cart and proceed to checkout.',
};

export default function CartPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container-custom py-8 md:py-12">
        <div className="mb-6 md:mb-8">
          <span className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground">
            Shopping Bag
          </span>
          <h1 className="font-heading text-2xl md:text-3xl text-foreground font-semibold mt-1">
            Review Your Items
          </h1>
        </div>
        <CartPageContent />
      </div>
    </div>
  );
}
