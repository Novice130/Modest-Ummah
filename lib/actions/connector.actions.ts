'use server';

import { getDb } from '@/lib/db';
import { apiKeys, integrationEvents } from '@/lib/schema';
import { desc, eq, isNull } from 'drizzle-orm';
import { getSession } from './auth.actions';
import { generateKeyPair, sha256 } from '@/lib/woo/auth';
import { encryptSecret } from '@/lib/woo/secret-box';
import { storeUrl, isOriginConfigured } from '@/lib/woo/store';

/**
 * Admin management of the WooCommerce-compatible API keys Pirate Ship uses.
 *
 * Every action re-checks the admin session. These functions mint credentials
 * that read customer PII over the public internet, so there is no read-only
 * or unauthenticated variant.
 */

export interface ApiKeySummary {
  id: string;
  description: string;
  truncatedKey: string;
  permissions: 'read' | 'read_write';
  lastAccess: string | null;
  createdAt: string;
}

export interface ConnectorStatus {
  enabled: boolean;
  storeUrl: string;
  originConfigured: boolean;
  emailConfigured: boolean;
  keys: ApiKeySummary[];
}

async function requireAdmin() {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');
  return session;
}

export async function fetchConnectorStatusAction(): Promise<ConnectorStatus> {
  await requireAdmin();

  const db = getDb();
  const rows = await db
    .select()
    .from(apiKeys)
    .where(isNull(apiKeys.revokedAt))
    .orderBy(desc(apiKeys.createdAt))
    .limit(25);

  return {
    enabled: process.env.WOO_SHIM_ENABLED === 'true',
    storeUrl: storeUrl(),
    originConfigured: isOriginConfigured(),
    emailConfigured: Boolean(process.env.BREVO_API_KEY),
    keys: rows.map((row) => ({
      id: row.id,
      description: row.description,
      truncatedKey: row.truncatedKey,
      permissions: row.permissions,
      lastAccess: row.lastAccess ? row.lastAccess.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/**
 * Mint a credential pair. The plaintext secret is shown exactly once.
 *
 * Two copies are persisted and neither is plaintext: a SHA-256 digest, which
 * is all the Basic-auth path ever compares against, and an AES-256-GCM
 * ciphertext, which OAuth 1.0a needs because it signs with the secret rather
 * than sending it. A database leak alone yields no working credential; the
 * encryption key lives in the environment, not the database.
 */
export async function createApiKeyAction(input: {
  description: string;
  permissions: 'read' | 'read_write';
}): Promise<{ consumerKey: string; consumerSecret: string }> {
  await requireAdmin();

  const description = (input.description || '').trim().slice(0, 120) || 'Pirate Ship';
  const permissions = input.permissions === 'read_write' ? 'read_write' : 'read';

  const { consumerKey, consumerSecret, truncatedKey } = generateKeyPair();

  const db = getDb();
  await db.insert(apiKeys).values({
    description,
    consumerKeyHash: sha256(consumerKey),
    consumerSecretHash: sha256(consumerSecret),
    consumerSecretEnc: encryptSecret(consumerSecret),
    truncatedKey,
    permissions,
  });

  return { consumerKey, consumerSecret };
}

/** Soft-revoke: the row stays for audit, but requireWooAuth() ignores it. */
export async function revokeApiKeyAction(keyId: string): Promise<void> {
  await requireAdmin();

  const db = getDb();
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, keyId));
}

export interface IntegrationEventSummary {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  ip: string | null;
  createdAt: string;
}

/**
 * Recent inbound requests. Rows with status 404 name endpoints Pirate Ship
 * wants that we have not implemented yet.
 */
export async function fetchIntegrationEventsAction(
  limit = 50
): Promise<IntegrationEventSummary[]> {
  await requireAdmin();

  const db = getDb();
  const rows = await db
    .select({
      id: integrationEvents.id,
      method: integrationEvents.method,
      path: integrationEvents.path,
      statusCode: integrationEvents.statusCode,
      ip: integrationEvents.ip,
      createdAt: integrationEvents.createdAt,
    })
    .from(integrationEvents)
    .orderBy(desc(integrationEvents.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));

  return rows.map((row) => ({
    id: row.id,
    method: row.method,
    path: row.path,
    statusCode: row.statusCode,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
  }));
}
