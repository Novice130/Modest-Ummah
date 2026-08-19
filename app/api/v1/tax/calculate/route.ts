/**
 * POST /api/v1/tax/calculate
 *
 * Re-exports the existing handler so the native client has everything under
 * one versioned namespace. The logic is deliberately NOT duplicated —
 * app/api/tax/calculate is the single implementation, and in
 * particular it recomputes every amount server-side and rejects
 * client-supplied totals. Forking it would risk that guarantee drifting.
 */
export { POST } from '@/app/api/tax/calculate/route';
