'use client';

import { useEffect } from 'react';
import { trackPaymentSucceeded } from '@/lib/analytics';

export function PaymentSucceededTracker() {
  useEffect(() => {
    trackPaymentSucceeded();
  }, []);

  return null;
}
