-- admin_totp: second factor for admin sign-in. Reviewed by hand; NOT yet applied.
-- Matches adminTotp in lib/schema.ts. Procedure: docs/admin-2fa.md.
--
-- Additive: one new table, nothing existing changes. The application reads it
-- only when ADMIN_2FA_REQUIRED=true or on /admin/settings/security, so it is
-- safe to apply before or after the code ships, but before setting that flag.

-- ─── Forward ──────────────────────────────────────────────────────────────
BEGIN;

CREATE TABLE IF NOT EXISTS admin_totp (
  admin_id             uuid      PRIMARY KEY REFERENCES admins (id) ON DELETE CASCADE,
  secret_enc           text      NOT NULL,
  confirmed_at         timestamp,
  last_used_step       bigint,
  recovery_code_hashes text[]    NOT NULL DEFAULT '{}',
  created_at           timestamp NOT NULL DEFAULT now(),
  updated_at           timestamp NOT NULL DEFAULT now()
);

COMMIT;

-- ─── Rollback ─────────────────────────────────────────────────────────────
-- Commented out so running this file can never drop anything.
-- First remove ADMIN_2FA_REQUIRED and recreate the web container: with the flag
-- on and the table gone, every admin sign-in is refused.
-- Dropping discards every enrolled authenticator and recovery code.
--
-- BEGIN;
-- DROP TABLE IF EXISTS admin_totp;
-- COMMIT;
