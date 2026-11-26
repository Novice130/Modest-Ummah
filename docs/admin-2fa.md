# Admin two-factor sign-in

Admins sign in only through `/admin/login` in a browser, including on the iPad
(the "iPad admin login" commit changed that web form). The Flutter app has no
admin screens or admin API, so it needs no change and cannot get around this.

## Turning it on

Do these in order. Deploying the code alone changes nothing: with the flag off
no sign-in reads `admin_totp`.

1. Deploy the code.
2. Generate the key with `openssl rand -hex 32`. Save it in the password manager
   and add it to `web.env` as `ADMIN_TOTP_ENC_KEY`. Recreate the web container.
3. Apply the forward section of `docs/migrations/admin_totp.sql`.
4. Sign in and open Settings, then Manage two-factor
   (`/admin/settings/security`). Set up the authenticator and save the recovery
   codes in the password manager.
5. Set `ADMIN_2FA_REQUIRED=true` in `web.env` and recreate the web container.
6. Test in a private window before closing the session you are in.

Step 5 signs every admin out once: tokens issued before it carry no `mfa` claim.
An admin who has not enrolled is sent through setup at their next sign-in, with
the password as the only proof, so enrol every admin at step 4.

## Lost phone

Try these in order.

1. **Recovery code.** Enter it in the code field at sign-in. It lands on the
   security page; use another recovery code there to replace the authenticator.
   The second code is needed because the first has already been spent.
2. **No recovery codes.** From a machine with the production `DATABASE_URL` and
   the password:

   ```sh
   node scripts/reset-admin-2fa.mjs admin@modestummah.com
   ```

   The next sign-in asks for the password, then goes through setup again. If the
   password is lost too, run `scripts/reset-admin-password.mjs` as well.
3. **Database unreachable, or the sign-in step itself is failing.** Remove
   `ADMIN_2FA_REQUIRED` from `web.env` and recreate the web container. Sign-in is
   then password only. Put it back after fixing the cause.

If a password and session may have been stolen, also rotate `JWT_SECRET`: admin
tokens cannot be revoked one at a time and otherwise last up to 24 hours.

## Losing ADMIN_TOTP_ENC_KEY

Authenticators stop working because their secrets cannot be decrypted. Recovery
codes keep working because they are hashed, not encrypted. Set a new key, sign in
with a recovery code, then use step 2 above: replacing through the security page
also works, but only with a recovery code.

## How it works

- Password correct and flag on: a 10-minute `admin_2fa_pending` cookie is set. Its
  token type is accepted by no route.
- A correct code mints the normal `admin_token` with `mfa: true`. `proxy.ts`,
  `getSession(true)` and `getAuthFromRequest(_, true)` all refuse an admin token
  without that claim while the flag is on, cookie or bearer.
- Codes: RFC 6238, SHA-1, 6 digits, 30 seconds, one step of drift. The last used
  step is stored and spent by a conditional UPDATE, which stops replays.
- Attempts: 5 per admin and 20 per IP per 15 minutes, in memory, reset on deploy.
- With the flag on and the table missing, password sign-in is refused and the
  error is logged. It does not fall back to password only.

## Checks

```sh
npx tsx scripts/check-totp.ts
npx tsx scripts/check-rate-limit.ts
```
