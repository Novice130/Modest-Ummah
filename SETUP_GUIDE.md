# Modest Ummah - Setup Guide

This guide walks you through setting up all the external services needed for your store. Follow each section step by step.

---

## Table of Contents
1. [PocketBase Setup](#1-pocketbase-setup)
2. [Stripe Payments Setup](#2-stripe-payments-setup)
3. [TaxCloud Setup (Tax Calculation)](#3-taxcloud-setup-tax-calculation)
4. [Pirate Ship Setup (Shipping)](#4-pirate-ship-setup-shipping)
5. [Google OAuth Setup (Optional)](#5-google-oauth-setup-optional)
6. [Final Checklist](#6-final-checklist)

---

## 1. PocketBase Setup

PocketBase is your database and authentication backend.

### Step 1: Download PocketBase
1. Go to https://pocketbase.io/docs
2. Download the version for your operating system
3. Extract the file to a folder

### Step 2: Start PocketBase
```bash
# Windows
pocketbase.exe serve

# Mac/Linux
./pocketbase serve
```

### Step 3: Create Admin Account
1. Open http://localhost:8090/_/ in your browser
2. Create your admin account (save these credentials!)

### Step 4: Import Schema
1. In PocketBase Admin, go to **Settings > Import Collections**
2. Upload the file: `pocketbase/pb_schema.json`
3. Click Import

### Step 5: Update Environment Variables
Add to your `.env.local`:
```
NEXT_PUBLIC_POCKETBASE_URL=http://localhost:8090
POCKETBASE_ADMIN_EMAIL=your-admin-email
POCKETBASE_ADMIN_PASSWORD=your-admin-password
```

---

## 2. Stripe Payments Setup

Stripe handles all payment processing.

### Step 1: Create Stripe Account
1. Go to https://stripe.com and sign up
2. Complete your business verification

### Step 2: Get API Keys
1. Go to https://dashboard.stripe.com/apikeys
2. Copy your **Publishable key** (starts with `pk_`)
3. Copy your **Secret key** (starts with `sk_`)

### Step 3: Set Up Webhook
**This is CRITICAL for orders to be saved after payment!**

1. Go to https://dashboard.stripe.com/webhooks
2. Click **Add endpoint**
3. Enter your webhook URL:
   - **Development**: Use ngrok or similar to expose localhost
   - **Production**: `https://modestummah.com/api/webhooks/stripe`
4. Select events to listen to:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `checkout.session.completed`
   - `charge.refunded`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)

### Step 4: Update Environment Variables
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxx
STRIPE_SECRET_KEY=sk_test_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
```

### Step 5: Test Webhook (Development)
For local testing, use Stripe CLI:
```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login
stripe login

# Forward webhooks to localhost
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Copy the webhook signing secret it shows
```

---

## 3. TaxCloud Setup (Tax Calculation)

TaxCloud provides free sales tax calculation and filing for all US states.

### Step 1: Create Account
1. Go to https://taxcloud.com
2. Click **Sign Up** (it's FREE)
3. Complete the registration form

### Step 2: Set Up Your Business
1. Log in to TaxCloud
2. Go to **Account Settings**
3. Add your business information
4. Add your nexus states (states where you have tax obligations)

### Step 3: Get API Credentials
1. Go to **Websites** in TaxCloud dashboard
2. Click **Add Website**
3. Enter your store URL
4. Copy your:
   - **API ID** (loginID)
   - **API Key**

### Step 4: Update Environment Variables
```
TAXCLOUD_API_LOGIN_ID=your_api_login_id
TAXCLOUD_API_KEY=your_api_key

# Your business address (shipping origin)
TAXCLOUD_ORIGIN_ADDRESS1=123 Your Business St
TAXCLOUD_ORIGIN_CITY=Your City
TAXCLOUD_ORIGIN_STATE=NY
TAXCLOUD_ORIGIN_ZIP5=10001
```

### How It Works
- Tax is calculated in real-time during checkout
- Rates are accurate for every US address
- TaxCloud handles SST (Streamlined Sales Tax) compliance
- You can file returns directly through TaxCloud

**Note**: If TaxCloud credentials are not set, the system automatically falls back to estimated state tax rates.

---

## 4. Pirate Ship Setup (Shipping)

Pirate Ship provides USPS Commercial Plus rates (cheapest rates available to small businesses).

### Step 1: Create Account
1. Go to https://www.pirateship.com
2. Click **Sign Up for Free**
3. Verify your email

### Step 2: Add Payment Method
1. Go to **Settings > Billing**
2. Add a payment method (you only pay for labels you create)

### Step 3: Verify Your Address
1. Go to **Settings > Ship From Addresses**
2. Add your business address
3. Verify it's correct

### Step 4: Get API Key
1. Go to **Settings > API**
2. Click **Generate API Key**
3. Copy the API key

### Step 5: Update Environment Variables
```
PIRATESHIP_API_KEY=your_pirateship_api_key

# Your shipping origin address
PIRATESHIP_ORIGIN_NAME=Modest Ummah
PIRATESHIP_ORIGIN_STREET1=123 Your Business St
PIRATESHIP_ORIGIN_CITY=Your City
PIRATESHIP_ORIGIN_STATE=NY
PIRATESHIP_ORIGIN_ZIP=10001
PIRATESHIP_ORIGIN_PHONE=+15551234567
PIRATESHIP_ORIGIN_EMAIL=shipping@modestummah.com
```

### Features You Get
- **USPS Commercial Plus Rates** - Cheapest USPS rates
- **Free Package Pickup** - Schedule USPS pickup from your location
- **Tracking** - Real-time tracking for all shipments
- **Address Verification** - Validates customer addresses
- **Label Generation** - Print shipping labels directly

**Note**: If Pirate Ship credentials are not set, the system uses estimated shipping rates.

---

## 5. Google OAuth Setup (Optional)

Allow users to sign in with their Google account.

### Step 1: Create Google Cloud Project
1. Go to https://console.cloud.google.com
2. Create a new project (or select existing)
3. Name it "Modest Ummah Store" or similar

### Step 2: Configure OAuth Consent Screen
1. Go to **APIs & Services > OAuth consent screen**
2. Select **External** user type
3. Fill in:
   - App name: Modest Ummah
   - User support email: your email
   - Developer contact: your email
4. Add scopes: `email`, `profile`
5. Save

### Step 3: Create OAuth Credentials
1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth Client ID**
3. Select **Web application**
4. Add authorized redirect URIs:
   - `http://localhost:8090/api/oauth2-redirect` (development)
   - `https://modestummah.com/api/oauth2-redirect` (production)
5. Copy **Client ID** and **Client Secret**

### Step 4: Configure PocketBase
1. Go to PocketBase Admin (http://localhost:8090/_/)
2. Go to **Settings > Auth providers**
3. Enable **Google**
4. Paste your Client ID and Client Secret
5. Save

### Step 5: Update Environment Variables
```
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

---

## 6. Final Checklist

Before going live, verify:

### Environment Variables
- [ ] `NEXT_PUBLIC_POCKETBASE_URL` is set
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set
- [ ] `STRIPE_SECRET_KEY` is set
- [ ] `STRIPE_WEBHOOK_SECRET` is set
- [ ] `TAXCLOUD_API_LOGIN_ID` is set (or using fallback)
- [ ] `TAXCLOUD_API_KEY` is set (or using fallback)
- [ ] `PIRATESHIP_API_KEY` is set (or using fallback)

### Stripe Webhook
- [ ] Webhook endpoint is created in Stripe dashboard
- [ ] All required events are selected
- [ ] Webhook signing secret is in `.env.local`
- [ ] Test payment creates order in PocketBase

### PocketBase
- [ ] Schema is imported
- [ ] Admin account is created
- [ ] Test user can register/login

### Store Functionality
- [ ] Products display correctly
- [ ] Add to cart works
- [ ] Checkout flow completes
- [ ] Orders appear in PocketBase
- [ ] Order confirmation page shows

### Production Deployment
- [ ] Update all URLs to production domain
- [ ] Switch Stripe to live keys
- [ ] Set up SSL certificate
- [ ] Configure DNS
- [ ] Test full purchase flow

---

## Quick Reference - All Environment Variables

```bash
# App
NEXT_PUBLIC_APP_URL=https://modestummah.com
NEXT_PUBLIC_APP_NAME="Modest Ummah"

# PocketBase
NEXT_PUBLIC_POCKETBASE_URL=http://localhost:8090
POCKETBASE_ADMIN_EMAIL=admin@modestummah.com
POCKETBASE_ADMIN_PASSWORD=secure-password

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# TaxCloud
TAXCLOUD_API_LOGIN_ID=your_login_id
TAXCLOUD_API_KEY=your_api_key
TAXCLOUD_ORIGIN_ADDRESS1=123 Business St
TAXCLOUD_ORIGIN_CITY=New York
TAXCLOUD_ORIGIN_STATE=NY
TAXCLOUD_ORIGIN_ZIP5=10001

# Pirate Ship
PIRATESHIP_API_KEY=your_api_key
PIRATESHIP_ORIGIN_NAME=Modest Ummah
PIRATESHIP_ORIGIN_STREET1=123 Business St
PIRATESHIP_ORIGIN_CITY=New York
PIRATESHIP_ORIGIN_STATE=NY
PIRATESHIP_ORIGIN_ZIP=10001

# Google OAuth (optional)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
```

---

## Need Help?

If you encounter issues:

1. **Check the console** - Most errors show in browser console or terminal
2. **Verify environment variables** - Make sure `.env.local` exists and has correct values
3. **Check PocketBase logs** - PocketBase terminal shows API errors
4. **Stripe Dashboard** - Check Developers > Logs for payment issues
5. **TaxCloud Dashboard** - Check for API errors
6. **Pirate Ship Dashboard** - Check shipping API status

---

*Last Updated: January 2026*
