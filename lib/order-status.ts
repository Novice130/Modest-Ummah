import type { BadgeProps } from '@/components/ui/badge';

/**
 * Single source of truth for order/payment status presentation and for which
 * manual status changes an admin may make. Imported by both client pages and
 * the server actions, so the buttons the admin sees and the transitions the
 * server accepts cannot drift apart. No server-only imports here.
 */

export const ORDER_STATUSES = [
  'pending_payment',
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['pending', 'paid', 'partial', 'refunded', 'failed'] as const;
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];

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

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Awaiting Payment',
  pending: 'On Hold',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function formatOrderStatus(status: string): string {
  return (
    ORDER_STATUS_LABELS[status] ||
    status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Payment badge. "pending" used to render red (destructive) next to every
 * unpaid checkout, which read as an error; only failed payments are red now.
 */
export function paymentStatusBadgeVariant(status: string): BadgeProps['variant'] {
  switch (status) {
    case 'paid':
      return 'success';
    case 'partial':
      return 'gold';
    case 'refunded':
      return 'outline';
    case 'failed':
      return 'destructive';
    default:
      return 'secondary';
  }
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Unpaid',
  paid: 'Paid',
  partial: 'Partially Refunded',
  refunded: 'Refunded',
  failed: 'Failed',
};

export function formatPaymentStatus(status: string): string {
  return PAYMENT_STATUS_LABELS[status] || formatOrderStatus(status);
}

/** Money has been captured and not fully returned: the order may be fulfilled. */
export function isPaymentCaptured(paymentStatus: string): boolean {
  return paymentStatus === 'paid' || paymentStatus === 'partial';
}

/**
 * Manual status changes an admin may make from the order page.
 *
 * Rules (mirroring Shopify/WooCommerce behaviour):
 *  - Cancelled and delivered are terminal. Nothing un-cancels an order.
 *  - Nothing ships unless payment was captured.
 *  - "Awaiting payment" is owned by Stripe: the webhook moves it to
 *    processing. The admin can only cancel it (an abandoned checkout).
 *  - Paid orders are not cancelled directly: they are refunded, which
 *    cancels them and restocks inventory via the charge.refunded webhook.
 *    Cancelling a paid order without a refund would keep the customer's
 *    money and leave the decremented stock unreturned.
 */
export function allowedStatusTransitions(order: {
  status: string;
  paymentStatus: string;
}): OrderStatusValue[] {
  const paid = isPaymentCaptured(order.paymentStatus);
  if (order.paymentStatus === 'refunded') return [];

  switch (order.status) {
    case 'pending_payment':
      return paid ? ['processing'] : ['cancelled'];
    case 'pending':
      return paid ? ['processing', 'shipped'] : ['cancelled'];
    case 'processing':
      return paid ? ['pending', 'shipped'] : ['pending', 'cancelled'];
    case 'shipped':
      return ['delivered'];
    default:
      return [];
  }
}

export function canTransition(
  order: { status: string; paymentStatus: string },
  next: string
): boolean {
  return (allowedStatusTransitions(order) as string[]).includes(next);
}

/** Explain why an order cannot move to `next`, for server-side errors. */
export function transitionError(
  order: { status: string; paymentStatus: string },
  next: string
): string {
  if (order.status === next) return `Order is already ${formatOrderStatus(next)}.`;
  if (order.status === 'cancelled') return 'Cancelled orders cannot be reopened.';
  if (order.status === 'delivered') return 'Delivered orders cannot change status.';
  if (order.paymentStatus === 'refunded') return 'Refunded orders cannot change status.';
  if ((next === 'shipped' || next === 'delivered' || next === 'processing') && !isPaymentCaptured(order.paymentStatus)) {
    return 'This order has not been paid. Only paid orders can be fulfilled.';
  }
  if (next === 'cancelled' && isPaymentCaptured(order.paymentStatus)) {
    return 'This order has been paid. Refund it instead; the refund also cancels it and restocks the items.';
  }
  return `Cannot change status from ${formatOrderStatus(order.status)} to ${formatOrderStatus(next)}.`;
}

// ─── Carriers / tracking ────────────────────────────────

export const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'] as const;

/** Public tracking page for a carrier + number, or null when unknown. */
export function trackingUrl(carrier: string | null | undefined, trackingNumber: string | null | undefined): string | null {
  if (!trackingNumber) return null;
  const n = encodeURIComponent(trackingNumber.trim());
  const c = (carrier || '').toLowerCase();
  if (c.includes('usps') || c.includes('postal')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${n}`;
  if (c.includes('dhl')) return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?tracking-id=${n}`;
  return null;
}

// ─── Admin list filters (shared by the list page, its server action and the CSV export) ───

export type OrderListTab =
  | 'all'
  | 'unfulfilled'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'pending_payment';

export type OrderListSort = 'newest' | 'oldest' | 'total_desc' | 'total_asc';

export interface OrderListFilters {
  tab?: OrderListTab;
  search?: string;
  paymentStatus?: string;
  /** ISO timestamps, inclusive. The client converts local dates to these. */
  dateFrom?: string;
  dateTo?: string;
}
