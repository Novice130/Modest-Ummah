import { getDb } from '@/lib/db';
import { orders, orderNotes, type OrderSelect } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { fromWooStatus } from '@/lib/woo/serialize';
import { sendShippingNotification } from '@/lib/email';
import { normalizeAddress, fullName } from '@/lib/address';

/**
 * Inbound writes from Pirate Ship.
 *
 * After a label is bought, Pirate Ship marks the order Completed and attaches
 * the tracking number — as order meta, as an order note, or both, depending on
 * the merchant's settings. Both paths land here.
 */

// ─── Tracking extraction ────────────────────────────────

/**
 * Carrier tracking number patterns, most specific first.
 *
 * Ordering matters: UPS and FedEx Ground (96-prefixed) both start with digits
 * that a loose USPS pattern would swallow.
 */
const TRACKING_PATTERNS: Array<{ carrier: string; pattern: RegExp }> = [
  { carrier: 'UPS', pattern: /\b(1Z[0-9A-Z]{16})\b/i },
  // USPS: 20-22 digit IMpb starting 92/93/94/95, or 9400/9205 variants.
  { carrier: 'USPS', pattern: /\b(9[2-5]\d{18,20})\b/ },
  // USPS international / certified: 2 letters + 9 digits + 2 letters.
  { carrier: 'USPS', pattern: /\b([A-Z]{2}\d{9}US)\b/i },
  // FedEx Ground 96-prefixed 22-digit, then 12 and 15 digit forms.
  { carrier: 'FedEx', pattern: /\b(96\d{20})\b/ },
  { carrier: 'FedEx', pattern: /\b(\d{15})\b/ },
  { carrier: 'FedEx', pattern: /\b(\d{12})\b/ },
];

export interface ExtractedTracking {
  trackingNumber: string;
  carrier: string;
}

/** Pull a tracking number and carrier out of free text (an order note). */
export function extractTracking(text: string): ExtractedTracking | null {
  if (!text) return null;

  for (const { carrier, pattern } of TRACKING_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { trackingNumber: match[1].toUpperCase(), carrier: carrierHint(text) || carrier };
    }
  }
  return null;
}

/** A carrier named explicitly in the text beats one inferred from the number. */
function carrierHint(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('usps') || lower.includes('postal')) return 'USPS';
  if (lower.includes('ups')) return 'UPS';
  if (lower.includes('fedex') || lower.includes('fed ex')) return 'FedEx';
  if (lower.includes('dhl')) return 'DHL';
  return null;
}

// ─── Meta parsing ───────────────────────────────────────

const TRACKING_META_KEYS = new Set([
  '_tracking_number',
  'tracking_number',
  '_wc_shipment_tracking_number',
]);
const CARRIER_META_KEYS = new Set([
  '_tracking_provider',
  'tracking_provider',
  '_shipping_provider',
  'carrier',
]);
const LABEL_META_KEYS = new Set(['_label_url', 'label_url']);
const SHIPMENT_META_KEYS = new Set(['_shipment_id', 'shipment_id']);

interface MetaEntry {
  key?: unknown;
  value?: unknown;
}

export interface ParsedMeta {
  trackingNumber?: string;
  carrier?: string;
  labelUrl?: string;
  shipmentId?: string;
}

/** Read fulfilment fields out of a Woo `meta_data` array. */
export function parseTrackingMeta(metaData: unknown): ParsedMeta {
  const out: ParsedMeta = {};
  if (!Array.isArray(metaData)) return out;

  for (const raw of metaData as MetaEntry[]) {
    if (!raw || typeof raw !== 'object') continue;
    const key = typeof raw.key === 'string' ? raw.key.toLowerCase() : '';
    if (!key) continue;

    // The Advanced Shipment Tracking plugin nests an array of shipments.
    if (key === '_wc_shipment_tracking_items' && Array.isArray(raw.value)) {
      const first = raw.value[0] as Record<string, unknown> | undefined;
      if (first) {
        if (typeof first.tracking_number === 'string') out.trackingNumber = first.tracking_number;
        if (typeof first.tracking_provider === 'string') out.carrier = first.tracking_provider;
      }
      continue;
    }

    const value = typeof raw.value === 'string' ? raw.value.trim() : '';
    if (!value) continue;

    if (TRACKING_META_KEYS.has(key)) out.trackingNumber = value;
    else if (CARRIER_META_KEYS.has(key)) out.carrier = value;
    else if (LABEL_META_KEYS.has(key)) out.labelUrl = value;
    else if (SHIPMENT_META_KEYS.has(key)) out.shipmentId = value;
  }

  return out;
}

// ─── Apply ──────────────────────────────────────────────

export interface WritebackInput {
  status?: unknown;
  meta_data?: unknown;
  /** Free text from an order-note POST. */
  noteText?: string;
  customerNote?: boolean;
}

export interface WritebackResult {
  order: OrderSelect;
  changed: boolean;
  emailSent: boolean;
}

/**
 * Apply a Pirate Ship writeback to an order.
 *
 * Idempotent by design: re-posting the same tracking number is a no-op and
 * will not re-send the customer email. Pirate Ship retries on network errors,
 * so this matters.
 *
 * Runs as a direct DB write rather than through updateOrderAction() — that
 * action requires an admin session, and this caller is an API key.
 */
export async function applyWriteback(
  order: OrderSelect,
  input: WritebackInput
): Promise<WritebackResult> {
  const db = getDb();

  const meta = parseTrackingMeta(input.meta_data);
  const fromNote = input.noteText ? extractTracking(input.noteText) : null;

  const trackingNumber = meta.trackingNumber || fromNote?.trackingNumber || null;
  const carrier = meta.carrier || fromNote?.carrier || null;

  const update: Partial<typeof orders.$inferInsert> = {};

  // Status
  const requestedStatus =
    typeof input.status === 'string' ? fromWooStatus(input.status) : null;

  if (requestedStatus && requestedStatus !== order.status) {
    // Never let an integration resurrect a cancelled or refunded order.
    const terminal = order.status === 'cancelled' || order.paymentStatus === 'refunded';
    if (!terminal) {
      update.status = requestedStatus as OrderSelect['status'];
      if (requestedStatus === 'shipped' && !order.shippedAt) {
        update.shippedAt = new Date();
      }
    }
  }

  // Tracking
  const trackingIsNew = Boolean(trackingNumber) && trackingNumber !== order.trackingNumber;
  if (trackingIsNew) {
    update.trackingNumber = trackingNumber;
    update.externalSource = 'pirateship';
    // A tracking number implies the parcel shipped, even if the caller did not
    // send a status change in the same request.
    if (order.status !== 'shipped' && order.status !== 'delivered' && !update.status) {
      const terminal = order.status === 'cancelled' || order.paymentStatus === 'refunded';
      if (!terminal) {
        update.status = 'shipped';
        update.shippedAt = order.shippedAt || new Date();
      }
    }
  }
  if (carrier && carrier !== order.trackingCarrier) update.trackingCarrier = carrier;
  if (meta.labelUrl && meta.labelUrl !== order.labelUrl) update.labelUrl = meta.labelUrl;
  if (meta.shipmentId && meta.shipmentId !== order.shipmentId) update.shipmentId = meta.shipmentId;

  // Note row — recorded whether or not it carried a tracking number.
  if (input.noteText) {
    await db.insert(orderNotes).values({
      orderId: order.id,
      note: input.noteText,
      customerNote: Boolean(input.customerNote),
      author: 'Pirate Ship',
    });
  }

  if (Object.keys(update).length === 0) {
    return { order, changed: false, emailSent: false };
  }

  update.updatedAt = new Date();

  const [updated] = await db
    .update(orders)
    .set(update)
    .where(eq(orders.id, order.id))
    .returning();

  // Notify the customer only on the transition into shipped *with* a tracking
  // number they can actually use. app/faq promises this email; until now
  // sendShippingNotification had no callers at all.
  let emailSent = false;
  if (trackingIsNew && updated?.trackingNumber) {
    emailSent = await notifyShipped(updated);
  }

  return { order: updated || order, changed: true, emailSent };
}

async function notifyShipped(order: OrderSelect): Promise<boolean> {
  try {
    const address = normalizeAddress(order.shippingAddress);
    const result = await sendShippingNotification({
      email: order.email,
      customerName: fullName(address) || 'there',
      orderId: order.orderId,
      trackingNumber: order.trackingNumber || '',
      carrier: order.trackingCarrier || 'USPS',
    });
    if (!result.success) {
      console.error('[woo] shipping notification failed:', result.error);
    }
    return result.success;
  } catch (error) {
    // A mail failure must not fail the writeback — Pirate Ship would retry and
    // we would double-apply.
    console.error('[woo] shipping notification threw:', error);
    return false;
  }
}
