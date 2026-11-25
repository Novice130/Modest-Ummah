import * as Sentry from '@sentry/nextjs';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { stripeEvents } from '@/lib/schema';

/**
 * Exactly-once bookkeeping for the Stripe webhook, on the existing
 * stripe_events table (no schema change). neon-http has no transactions, so a
 * handler cannot commit its writes together; instead each side effect that
 * must not repeat claims its own row.
 *
 *  - An event id row means "fully handled". It is written last, so a delivery
 *    that failed or crashed part way is processed again when Stripe retries.
 *  - A step row, keyed by payment or charge id plus step name, guards one side
 *    effect. Its `type` is step:pending while running and step:done after.
 */

const PENDING = 'step:pending';
const DONE = 'step:done';

/** Past this a pending step belongs to a process that died, not a live one. */
const STALE_MS = 10 * 60 * 1000;

/** Another delivery is running this step. Stripe should retry later. */
export class StepInProgressError extends Error {
  constructor(key: string) {
    super(`Webhook step in progress: ${key}`);
    this.name = 'StepInProgressError';
  }
}

export async function isEventHandled(eventId: string): Promise<boolean> {
  const [row] = await getDb()
    .select()
    .from(stripeEvents)
    .where(eq(stripeEvents.eventId, eventId))
    .limit(1);
  return Boolean(row);
}

export async function markEventHandled(eventId: string, type: string): Promise<void> {
  await getDb()
    .insert(stripeEvents)
    .values({ eventId, type })
    .onConflictDoNothing()
    .returning();
}

/**
 * Run `fn` unless this key already ran. If `fn` throws the claim is released,
 * so a retry runs it again; `fn` must therefore leave nothing half done when it
 * throws.
 *
 * A process that dies inside `fn` leaves a pending row, and nobody can tell
 * whether the write landed. That step is treated as done and reported for a
 * manual check: being one unit off is recoverable, a double decrement or a
 * second email to the customer is what this exists to prevent.
 */
export async function runOnce(key: string, fn: () => Promise<void>): Promise<void> {
  const db = getDb();
  const [claimed] = await db
    .insert(stripeEvents)
    .values({ eventId: key, type: PENDING })
    .onConflictDoNothing()
    .returning();

  if (!claimed) {
    const [row] = await db
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.eventId, key))
      .limit(1);
    if (row?.type === DONE) return;
    if (!row || Date.now() - new Date(row.processedAt).getTime() < STALE_MS) {
      throw new StepInProgressError(key);
    }
    Sentry.captureMessage('Stripe webhook step was interrupted; check it by hand', {
      level: 'error',
      tags: { webhookStep: key },
    });
    await db.update(stripeEvents).set({ type: DONE }).where(eq(stripeEvents.eventId, key));
    return;
  }

  try {
    await fn();
  } catch (error) {
    try {
      await db.delete(stripeEvents).where(eq(stripeEvents.eventId, key));
    } catch {
      // Left pending: the stale path above picks it up and reports it.
    }
    throw error;
  }

  // Outside the try: fn succeeded, so a failure here must not release the claim.
  await db.update(stripeEvents).set({ type: DONE }).where(eq(stripeEvents.eventId, key));
}
