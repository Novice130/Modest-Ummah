import type { Metadata } from 'next';
import CheckoutForm from '@/components/checkout/checkout-form';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Complete your order securely with our checkout process.',
};

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container-custom py-8">
        <h1 className="font-heading text-3xl mb-8">Checkout</h1>
        <CheckoutForm />
      </div>
    </div>
  );
}
