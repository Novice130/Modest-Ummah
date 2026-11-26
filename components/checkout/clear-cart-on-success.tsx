'use client';

import { useEffect } from 'react';
import { useCartStore } from '@/lib/store';

/** Rendered only for a successful payment. Empties the cart once per payment. */
export default function ClearCartOnSuccess({ paymentRef }: { paymentRef: string }) {
  const completePurchase = useCartStore((state) => state.completePurchase);

  useEffect(() => {
    completePurchase(paymentRef);
  }, [completePurchase, paymentRef]);

  return null;
}
