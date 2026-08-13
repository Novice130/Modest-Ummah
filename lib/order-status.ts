import type { BadgeProps } from '@/components/ui/badge';

/**
 * Single source of truth for mapping order status → badge variant.
 * Previously admin and customer pages disagreed (the same order showed
 * different colors depending on who was looking).
 */
export function orderStatusBadgeVariant(status: string): BadgeProps['variant'] {
  switch (status) {
    case 'delivered':
      return 'success';
    case 'shipped':
      return 'default';
    case 'processing':
      return 'gold';
    case 'pending':
    case 'pending_payment':
      return 'secondary';
    case 'cancelled':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function formatOrderStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
