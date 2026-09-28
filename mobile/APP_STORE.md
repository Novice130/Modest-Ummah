# App Store Connect — Modest Ummah (iOS)

Everything App Store Connect asks for, in the order it asks. The App Privacy
section is transcribed from the privacy manifests in the build, not written from
memory: a mismatch between the manifests and the answers is a guaranteed
rejection.

Bundle id: `com.modestummah.modestUmmah` (already set in `project.pbxproj`)
Version / build: `1.0.0` / `1` (`pubspec.yaml:4` → `FLUTTER_BUILD_NAME` /
`FLUTTER_BUILD_NUMBER`)
SKU: `MODESTUMMAH-IOS-001`
Primary language: English (U.S.)
Minimum iOS: **15.0** — required by `stripe_ios` 14, the first release that
works under Flutter's UIScene lifecycle. Anything older leaves the payment
sheet unable to present.

---

## 1. App information

| Field | Value |
|---|---|
| Name | `Modest Ummah` |
| Subtitle (30) | `CZ jewellery & modest wear` (26) |
| Primary category | Shopping |
| Secondary category | Lifestyle |
| Content rights | Contains no third-party content |
| Age rating | 4+ (all questionnaire answers **None**; see §4) |

URLs:

| Field | Value |
|---|---|
| Privacy policy URL | `https://modestummah.com/privacy` |
| Support URL | `https://modestummah.com/contact` |
| Marketing URL | `https://modestummah.com` |

All four return 200 as of 2026-08-20.

---

## 2. Version information

### Promotional text (170 max — editable without a review)

```
New in the app: browse the full jewellery collection, save pieces to your
wishlist, and check out in a couple of taps with Apple-grade payment security.
```
(154)

### Description

```
Modest Ummah brings our cubic-zirconia jewellery and modest wear to your phone.

Every piece in the shop is here: necklace sets, bridal sets, bracelets, bangles
and cuffs, rings, brooches, and abayas — photographed properly, priced clearly,
and searchable in a second.

BROWSE
Shop by collection or search by name. Product pages show the full photo set,
the description, and what is in stock right now.

SAVE
Tap the heart on anything you are not ready to buy. Your saved list stays on
your device, no account needed.

BAG AND CHECKOUT
Add to your bag while signed out and it is still there later. When you are
ready, checkout takes a shipping address and hands off to a secure payment
sheet — card details go straight to our payment processor and never touch the
app or our servers.

ORDERS
Sign in to see every order you have placed, with its status and contents.

YOUR ACCOUNT, YOUR CALL
Create an account with an email address and a password. No tracking, no ad
identifiers, no data sold to anyone. You can delete your account, and
everything attached to it, from inside the app at any time — Account →
Delete my account.

Questions? modestummah.com/contact
```

### Keywords (100 max, comma-separated, no spaces)

```
modest,hijab,abaya,jewellery,jewelry,cubic zirconia,cz,bridal,necklace,bracelet,bangle,muslim
```
(99)

### What's New in This Version

```
First release.
```

---

## 3. App Privacy — answers transcribed from the shipped manifests

Sources, all inside the built app:

- `ios/Runner/PrivacyInfo.xcprivacy` — our own code
- `Pods/StripePaymentSheet/.../PrivacyInfo.xcprivacy`
- `Pods/StripeCore/.../PrivacyInfo.xcprivacy`
- `Pods/StripePayments/Stripe3DS2/.../PrivacyInfo.xcprivacy`

**App Store Connect answers must cover the SDKs as well as our own code.** Our
manifest declares four data types; Stripe's manifests declare two more. Answer
for all six or the privacy report generated from the archive will not match the
questionnaire.

### First question: "Do you or your third-party partners collect data from this app?"

**Yes.**

### Data types to select

| Data type (ASC label) | Collected | Linked to user | Used for tracking | Purpose(s) | Declared in |
|---|---|---|---|---|---|
| Contact Info → Name | Yes | Yes | No | App Functionality | `Runner/PrivacyInfo.xcprivacy` (`…DataTypeName`) |
| Contact Info → Email Address | Yes | Yes | No | App Functionality | `Runner/PrivacyInfo.xcprivacy` (`…DataTypeEmailAddress`) |
| Contact Info → Physical Address | Yes | Yes | No | App Functionality | `Runner/PrivacyInfo.xcprivacy` (`…DataTypePhysicalAddress`) |
| Purchases → Purchase History | Yes | Yes | No | App Functionality | `Runner/PrivacyInfo.xcprivacy` (`…DataTypePurchaseHistory`) |
| Financial Info → Payment Info | Yes | Yes | No | App Functionality | StripePaymentSheet (`…DataTypePaymentInfo`) |
| Usage Data → Product Interaction | Yes | Yes | No | **Analytics** and App Functionality | StripePaymentSheet, StripeCore, Stripe3DS2 (`…DataTypeProductInteraction`) |

Everything else in the ASC list — Health, Financial Info → Credit Info, Location,
Sensitive Info, Contacts, User Content, Browsing History, Search History,
Identifiers, Diagnostics, Other Data — is **not collected**.

### Tracking

`NSPrivacyTracking` is `false` and `NSPrivacyTrackingDomains` is empty in our
manifest, and every Stripe entry sets `NSPrivacyCollectedDataTypeTracking` to
`false`.

→ "Used for tracking" is **No** on every row above.
→ The app does **not** need App Tracking Transparency, and there is no
`NSUserTrackingUsageDescription` in `Info.plist`.

### Notes for the two Stripe rows

- **Payment Info**: card details are entered inside Stripe's own payment sheet
  and go directly to Stripe. They never reach our code or our servers — but
  Apple counts data collected by an embedded SDK as collected by the app, so it
  is declared.
- **Product Interaction / Analytics**: Stripe's SDKs report their own
  in-sheet telemetry. This is the one purpose in the list that is not "App
  Functionality"; it comes entirely from the SDK, not from us. We ship no
  analytics SDK of our own.

### Required-reason API declarations (no ASC question — already in the manifest)

| API category | Reason | Why |
|---|---|---|
| `UserDefaults` | `CA92.1` | `shared_preferences` (bag, wishlist), and Stripe's own use |
| `FileTimestamp` | `C617.1` | `cached_network_image` disk cache |
| `DiskSpace` | `E174.1` | image cache eviction |

### Export compliance

`ITSAppUsesNonExemptEncryption` is `false` in `Info.plist` → ASC will not ask
again. (HTTPS only, no proprietary cryptography.)

---

## 4. Age rating questionnaire

Answer **None** to every category — no violence, no sexual content, no profanity,
no horror, no gambling, no contests, no drugs, alcohol or tobacco references,
no medical or treatment information, no user-generated content, no messaging, no
unrestricted web access. Not made for kids.

Result: **4+**.

---

## 5. App Review Information

**Sign-in required:** Yes (browsing works signed out; orders and checkout need an
account).

| Field | Value |
|---|---|
| Username | `appreview@modestummah.com` |
| Password | `ReviewPass2026!` |

The account exists already (created 2026-08-20 against the live database). It is
a review account with no order history and no payment method attached — rotate
or delete it once the app is approved.

Notes to reviewer:

```
Browsing, search and the bag all work without an account. Sign-in is only
needed for checkout and order history.

Payments run through Stripe's payment sheet. If you test a purchase, use the
Stripe test card 4242 4242 4242 4242, any future expiry, any CVC, any ZIP —
this account is pointed at Stripe test mode, so no real charge is made.

Account deletion is inside the app, as required by guideline 5.1.1(v):
Account tab → "Delete my account" → confirm. It calls DELETE /api/v1/me, which
deletes the user row and cart and detaches past orders.

This app has no ad identifiers, no tracking, and no third-party analytics of our
own. The only SDK that reports telemetry is Stripe's payment sheet.

Contact: modestummah.com/contact
```

---

## 6. Screenshots & App Preview Videos

All screenshots and app preview videos have been captured on native simulators and formatted to strict App Store Connect pixel and duration dimensions (no alpha channels).

### Screenshots

1. **iPhone 6.5" Display (`1284 x 2778`)** — Located in `mobile/screenshots/iphone_6.5/`:
   - `01_shop.png` (Shop / Collection view)
   - `02_product.png` (Product detail & Add to Cart)
   - `03_search.png` (Search experience)
   - `04_bag.png` (Shopping bag)
   - `05_checkout.png` (Checkout form)
   - `06_account.png` (Account & order management)

2. **iPhone 6.9" Display (`1320 x 2868`)** — Located in `mobile/screenshots/iphone_6.9/`:
   - `01_shop.png` through `06_account.png` (matching the modern iPhone 16/17 Pro Max dimensions)

3. **iPad 13" Display (`2048 x 2732`)** — Located in `mobile/screenshots/ipad_13/`:
   - `01_shop.png` through `06_account.png` (matching iPad Pro 13-inch M4/M5)

### App Preview Walkthrough Videos

App Previews meet all App Store specifications (duration 15–30s, H.264, 30fps):
- **iPhone App Preview**: `mobile/screenshots/videos/iphone_preview.mp4`
  - Dimensions: **886 x 1920** (Apple's accepted resolution for iPhone 6.5" & 6.9")
  - Duration: **26.5s**
- **iPad App Preview**: `mobile/screenshots/videos/ipad_preview.mp4`
  - Dimensions: **1200 x 1600** (Apple's accepted resolution for iPad Pro 13")
  - Duration: **27.0s**

---

## 7. Signing and upload — the part that needs the Apple account

Nothing below can be scripted; it needs the developer account signed in to Xcode.

1. **Create the app record** at appstoreconnect.apple.com → Apps → **+** →
   New App. Platform iOS, name `Modest Ummah`, primary language English (U.S.),
   bundle id `com.modestummah.modestUmmah`, SKU `MODESTUMMAH-IOS-001`.
   The bundle id must exist in the Developer portal first (Certificates,
   Identifiers & Profiles → Identifiers → **+** → App IDs → App). No special
   capabilities are needed — no push, no Sign in with Apple, no App Groups.

2. **Sign the app.** `open mobile/ios/Runner.xcworkspace` → target **Runner** →
   Signing & Capabilities → check *Automatically manage signing* → select the
   team. Do the same for the **RunnerTests** target if Xcode flags it. The
   bundle id is already `com.modestummah.modestUmmah`; do not change it in Xcode
   or it will drift from `project.pbxproj`.

3. **Build the release archive** with the production API base URL — the
   `--dart-define`s are compiled in, so an archive built without them points at
   nothing:

   ```bash
   cd vibe_modest/mobile
   flutter build ipa \
     --dart-define=API_BASE_URL=https://modestummah.com \
     --dart-define=STRIPE_PUBLISHABLE_KEY=pk_live_...
   ```

   That writes `build/ios/archive/Runner.xcarchive`. Open it in Xcode
   (Window → Organizer) → Distribute App → App Store Connect → Upload.
   Alternatively `xcrun altool`/`notarytool` with an App Store Connect API key.

4. **Before the live key goes in**: the server needs the matching
   `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for live mode, and the live
   webhook endpoint must point at `https://modestummah.com/api/webhooks/stripe`.
   The webhook is what writes the order — a live build against a test-mode
   server (or the reverse) takes payments and creates no orders.

5. **TestFlight**: after processing, add yourself as an internal tester and run
   the build on a real device before submitting. Ledger item 7.4.

6. **Submit for review** with the copy in §2, the answers in §3 and §4, and the
   review notes in §5.
