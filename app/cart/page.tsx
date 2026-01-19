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
    <div className="min-h-screen bg-muted/30">
      <div className="container-custom py-8">
        <h1 className="font-heading text-3xl mb-8">Shopping Cart</h1>
        <CartPageContent />
      </div>
    </div>
  );
}
