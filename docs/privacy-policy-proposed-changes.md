# Proposed privacy policy changes

**Status: proposal for the owner to review. `app/privacy/page.tsx` has not been
changed.** This wording is a draft, not legal advice. Publish each part only when
the matching feature goes live, and update "Last updated" when you do.

| Feature | Goes live when | Currently |
|---|---|---|
| Web analytics (PostHog) | An image is built with `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` | Off, no key configured |
| App crash reports (Sentry) | An app build uses `--dart-define=SENTRY_DSN=...` | Off, no DSN configured |
| Website error reports (Sentry) | An image is built with `NEXT_PUBLIC_SENTRY_DSN`, or the server has `SENTRY_DSN` | Code already on this branch; the published policy does not mention it |

## Decisions for the owner

1. **Consent.** Checkout sells to the UK, among other countries. PostHog runs here
   without cookies, but that does not settle whether UK or EU rules require consent
   for analytics. Nothing here adds a consent banner. Get this answered before
   turning analytics on.
2. **PostHog region.** The host setting decides where events are stored. Fill in
   `[US / EU]` below to match the project you create.
3. **PostHog project setting.** The browser must send its IP address to PostHog to
   deliver an event. The code asks PostHog not to look up location from it, and the
   project has a setting to discard client IP data. The wording below assumes that
   setting is on, so turn it on first, or change the wording.
4. **Retention.** Fill in `[retention period]` from the settings on each vendor plan.

## Add to "What we collect" (web analytics)

> **Website analytics.** If you browse our website, we record which pages and
> products are viewed, when an item is added to the cart, when checkout starts, and
> when a payment succeeds, including the order value and number of items. We use
> this to understand where our shop is working and where it is not. These records
> use a random identifier that is not linked to your account, and they do not
> include your name, email address, shipping address, phone number or payment
> details. Our analytics provider, PostHog, processes this data on our behalf in the
> `[US / EU]` and keeps it for `[retention period]`.

## Add to "What we collect" (app and website error reports)

> **Error reports.** If our app or website hits an error, it sends a technical report
> to our error-monitoring provider, Sentry, so that we can fix it. A report describes
> the error, the app or browser version, and the type of device and operating system.
> We remove personal details and sign-in information from these reports before they
> are sent wherever our software allows it, and we do not use them to identify you.
> Sentry keeps them for `[retention period]`.

The "wherever our software allows it" is deliberate: on iOS, a native crash is
reported by Sentry's native code, which does not pass through the app's Dart scrubbing
step. Those reports hold stack traces and device details and should not contain
customer data, but this has not been tested against a real project.

## Replace the "Cookies" section

Current text says only that essential cookies and a theme preference are used, so
analytics needs one more sentence.

> We use essential cookies to keep you signed in and to remember your cart. Our theme
> preference is stored on your device. Our website analytics do not set cookies. When
> you reach the payment step, we briefly store a random identifier, the order value
> and item count in your browser tab, so that a completed payment can be counted once.
> It is deleted when the payment succeeds or the tab closes. We do not use advertising
> trackers.

## Add to "Your rights"

Analytics records are not linked to an account, so the owner cannot look them up from
a customer's email address. Suggested addition:

> Website analytics records are not linked to your name or account, so we may be
> unable to find them in response to a request about you.

## Check the statements that stay

- "We do not sell or rent your personal information": still accurate.
- "We do not use advertising trackers": still accurate. `NSPrivacyTracking` stays
  false and PostHog runs with no advertising integration.
- The App Store description ("No tracking, no ad identifiers, no data sold to
  anyone") stays accurate. See `mobile/APP_STORE.md` section 3 for the answers that
  do change.
