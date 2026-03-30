# Modest Ummah — Complete Project Documentation

> **Last Updated:** March 31, 2026  
> **Version:** 2.0.0 (Post PocketBase → Neon Migration)  
> **Stack:** Next.js 16 · Drizzle ORM · Neon PostgreSQL · Stripe · Tailwind CSS 4 · shadcn/ui

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Database (Neon + Drizzle)](#database-neon--drizzle)
4. [Authentication System](#authentication-system)
5. [Admin Panel](#admin-panel)
6. [Order Fulfillment (Pirate Ship)](#order-fulfillment-pirate-ship)
7. [Payments (Stripe)](#payments-stripe)
8. [Deployment (Dokploy)](#deployment-dokploy)
9. [CI/CD (GitHub Actions)](#cicd-github-actions)
10. [MCP Agent (Dokploy)](#mcp-agent-dokploy)
11. [Environment Variables](#environment-variables)
12. [File Structure](#file-structure)
13. [Setup Guide (Getting Started)](#setup-guide)
14. [Common Tasks](#common-tasks)
15. [Troubleshooting](#troubleshooting)
16. [API Reference](#api-reference)
17. [Migration Notes (PocketBase → Neon)](#migration-notes)

---

## Project Overview

**Modest Ummah** is a full-stack e-commerce store for modest Islamic clothing, serving the US market. The application features:

- **Customer-facing store** — Browse, search, filter products; add to cart; checkout with Stripe
- **Admin panel** — Real-time analytics dashboard, order management, customer management, product CRUD, Pirate Ship CSV export for order fulfillment
- **Authentication** — Email/password sign-up/sign-in for customers and a separate admin authentication system
- **Payment processing** — Stripe Elements integration with webhook-based order fulfillment
- **Automated Shipping** — One-click CSV export compatible with Pirate Ship for USPS commercial shipping rates
- **Tax calculation** — TaxCloud API integration for US tax compliance (optional)

### Key Design Decisions

| Decision | Reasoning |
|---|---|
| **Drizzle ORM** (not Prisma) | Lighter weight, better TypeScript inference, no code generation step, works well with Neon's serverless driver |
| **Neon PostgreSQL** (not PocketBase) | Production-grade managed database, scales automatically, SQL-based, branch-able for dev |
| **Custom JWT auth** (not NextAuth) | Simpler integration with existing UI, preserves same login flow, no additional dependencies |
| **shadcn/ui** (not React Admin) | Consistent with existing store design, custom-styled, lightweight |
| **recharts** for analytics | Lightweight, React-native, good TypeScript support, customizable tooltips |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (Client)                      │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐   │
│  │ Store    │  │ Auth     │  │ Admin Dashboard      │   │
│  │ Pages    │  │ Forms    │  │ (Charts + Tables)    │   │
│  └────┬─────┘  └─────┬────┘  └──────────┬──────────┘   │
│       │               │                  │              │
│  ┌────▼───────────────▼──────────────────▼──────────┐   │
│  │           lib/pocketbase.ts (Compatibility Layer) │   │
│  │     · Client AuthStore (localStorage + cookie)    │   │
│  │     · API route callers (fetch → /api/*)          │   │
│  │     · Server-side Drizzle calls                   │   │
│  └────┬──────────────────────────────────────────────┘   │
└───────┼──────────────────────────────────────────────────┘
        │
┌───────▼──────────────────────────────────────────────────┐
│                    NEXT.JS SERVER                        │
│                                                         │
│  ┌────────────────────┐  ┌──────────────────────┐       │
│  │ API Routes         │  │ Server Components     │       │
│  │ /api/auth/*        │  │ Product pages          │       │
│  │ /api/admin/*       │  │ (direct Drizzle calls) │       │
│  │ /api/checkout/*    │  └─────────┬────────────┘       │
│  │ /api/webhooks/*    │            │                     │
│  └────────┬───────────┘            │                     │
│           │                        │                     │
│  ┌────────▼────────────────────────▼────────────────┐   │
│  │           lib/db.ts (Drizzle Client)              │   │
│  │           lib/schema.ts (Table Definitions)       │   │
│  │           lib/auth.ts (JWT + bcryptjs)             │   │
│  └────────────────────┬─────────────────────────────┘   │
└───────────────────────┼──────────────────────────────────┘
                        │
               ┌────────▼────────┐
               │  NEON PostgreSQL │
               │  (Serverless)    │
               └──────────────────┘
```

### Request Flow

1. **Client-side auth**: Uses `localStorage` for session persistence + `auth_token` / `admin_token` cookies
2. **Server components**: Import Drizzle functions directly from `lib/pocketbase.ts` (which calls Drizzle internally)
3. **Client components**: Call API routes via `fetch()` (wrapped inside `lib/pocketbase.ts` compatibility layer)
4. **API routes**: Verify JWT tokens from cookies, then perform Drizzle database operations
5. **Stripe webhooks**: Server-side only, directly use Drizzle to update order status

---

## Database (Neon + Drizzle)

### Connection

The database connection is established via `lib/db.ts` using Neon's HTTP driver (`@neondatabase/serverless`). This is **serverless-compatible** — no persistent connection pool, works in edge runtimes.

```typescript
// lib/db.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
```

### Schema (lib/schema.ts)

| Table | Description | Key Fields |
|---|---|---|
| `users` | Registered customers | id, email (unique), name, passwordHash, avatar, verified |
| `admins` | Admin users (separate table) | id, email (unique), name, passwordHash |
| `products` | Store products | id, name, slug (unique), price, category, images (JSON), sizes (JSON), colors (JSON) |
| `orders` | Customer orders | id, orderId (unique), userId (FK), items (JSON), total, status, paymentStatus, shippingAddress (JSON) |
| `carts` | User carts | id, userId (FK, unique), items (JSON) |

### JSON Column Types

Products store complex data in JSONB columns:
- `images`: `string[]` — Array of image URLs
- `colors`: `{ name: string; value: string; image?: string }[]`
- `sizes`: `string[]` — e.g., `["S", "M", "L", "XL"]`
- `tags`: `string[]`

Orders store:
- `items`: `OrderItem[]` — `{ productId, name, price, quantity, color?, size?, image? }`
- `shippingAddress`: `ShippingAddressDB` — `{ firstName, lastName, address1, address2?, city, state, postalCode, country, phone? }`

### Management Commands

```bash
# Generate migration SQL files from schema changes
npm run db:generate

# Push schema directly to database (for development)
npm run db:push

# Open Drizzle Studio (visual database browser)
npm run db:studio
```

### Indexes

The schema includes performance indexes on:
- `users.email` (unique)
- `admins.email` (unique)
- `products.slug` (unique), `products.category`, `products.featured`, `products.sku`
- `orders.orderId` (unique), `orders.userId`, `orders.status`, `orders.paymentStatus`, `orders.createdAt`
- `carts.userId` (unique)

---

## Authentication System

### How It Works

Authentication is **custom-built** using `bcryptjs` (password hashing) and `jose` (JWT tokens). There are two separate auth scopes:

1. **Customer Auth** — Cookie: `auth_token`, Expiry: 7 days, Stored in `localStorage` key: `mu_auth`
2. **Admin Auth** — Cookie: `admin_token`, Expiry: 24 hours, Stored in `localStorage` key: `mu_admin_auth`

### Login Flow

```
User enters credentials → POST /api/auth/login
                        → Server verifies password hash
                        → Server creates JWT token
                        → Server sets HttpOnly cookie
                        → Client saves to localStorage AuthStore
                        → Client redirects to /account
```

### Admin Login Flow

```
Admin enters credentials → POST /api/auth/admin-login
                        → Server checks admins table
                        → Server creates admin-scoped JWT
                        → Server sets admin_token cookie
                        → Client saves to localStorage AdminAuthStore
                        → Client redirects to /admin/dashboard
```

### Security Notes

- Passwords are hashed with **bcryptjs** (12 salt rounds)
- JWTs use **HS256** algorithm with `JWT_SECRET` env var
- Admin and user auth stores are **completely separate** — no session conflicts
- Cookies are `HttpOnly` + `SameSite=Lax` + `Secure` (in production)
- Token payload includes `type: 'user' | 'admin'` to prevent token reuse across scopes

### Creating an Admin Account

```bash
# After setting up the database:
npx tsx scripts/seed-admin.ts
```

Default admin credentials:
- Email: `admin@modestummah.com`
- Password: `ModestAdmin2026`

> ⚠️ **Change the password immediately after deployment!**

---

## Admin Panel

### Dashboard (`/admin/dashboard`)

The dashboard displays **live analytics** fetched from the `GET /api/admin/stats` endpoint. All data is aggregated from the database in real-time.

#### Stats Cards
- **Total Revenue** — Sum of all paid orders, with 30-day trend %
- **Total Orders** — Count of all orders, with 30-day trend %
- **Total Customers** — Count of registered users, with 30-day trend %
- **Total Products** — Count of all products in the store

#### Charts (recharts)
1. **Revenue & Orders (Area Chart)** — Monthly revenue over the last 6 months. Hover shows exact dollar amount.
2. **Order Status (Donut/Pie Chart)** — Breakdown of orders by status (pending, processing, shipped, delivered, cancelled). Hover shows count.
3. **Most Sold Items (Horizontal Bar Chart)** — Top 5 products by quantity sold. Hover shows quantity + revenue.

#### Recent Orders Table
- Shows the last 5 orders with order ID, customer name, total, and status badge
- Links to individual order detail page

### Orders Page (`/admin/orders`)

Features:
- **Status Filter Tabs**: All / Pending / Processing / Shipped / Delivered / Cancelled
- **Search**: By email or order ID
- **Checkbox Selection**: Select individual orders or select all
- **Export Selected**: Export only checked orders to Pirate Ship CSV
- **Export All**: Export all filtered orders to Pirate Ship CSV
- **Order Detail**: Click "View" to see full order details

### Customers Page (`/admin/customers`)

Features:
- **Total count** in header
- **Per-customer stats**: Total orders placed, total amount spent
- **Search**: By email or name
- **Columns**: Joined date, Name, Email, Orders, Total Spent, ID

### Products Page (`/admin/products`)

Features:
- Product list with CRUD operations
- Create/Edit product with rich form (images, colors, sizes, pricing)
- Delete product with confirmation

### Settings Page (`/admin/settings`)

- Store information management
- Environment variable reference

---

## Order Fulfillment (Pirate Ship)

### CSV Export Format

The CSV export matches **exactly** the Pirate Ship import format:

```csv
Name,Company,Email,Phone,Address Line 1,Address Line 2,City,State,Zip,Country,Weight (oz),Length (in),Width (in),Height (in),Order ID
John Doe,Modest Ummah,john@email.com,+1234567890,123 Main St,,Springfield,IL,62701,US,16,12,9,4,ORD-ABC123
```

### Default Shipping Dimensions (US Market)

Since exact product dimensions aren't always available, the system uses USPS-friendly defaults:

| Field | Default | Unit | Notes |
|---|---|---|---|
| Weight | 8 oz per item | Ounces | Multiplied by quantity. Min 16 oz (1 lb) |
| Length | 12 | Inches | Standard small parcel |
| Width | 9 | Inches | Standard small parcel |
| Height | 4 | Inches | Standard small parcel |

These defaults are suitable for clothing items and are within USPS First Class / Priority Mail limits.

### Export Methods

1. **Export All** — Exports all paid orders (or filtered orders) in the current view
2. **Export Selected** — Select specific orders via checkboxes and export only those
3. **API Route** — `POST /api/admin/orders/export` (server-side, requires admin auth)

### How to Use

1. Go to **Admin → Orders**
2. (Optional) Filter by status or search
3. (Optional) Select specific orders via checkboxes
4. Click **"Export All for Pirate Ship"** or **"Export Selected"**
5. A `.csv` file downloads automatically
6. Upload the CSV to **Pirate Ship** → Bulk Import
7. Review and purchase shipping labels

---

## Payments (Stripe)

### Flow

```
Cart → Checkout Page → Create PaymentIntent (server)
    → Stripe Elements (client) → User enters card
    → Stripe confirms payment → Webhook fires
    → Server updates order status → Email confirmation sent
```

### Key Files

| File | Purpose |
|---|---|
| `lib/stripe.ts` | Stripe SDK initialization, createPaymentIntent, verifyWebhookSignature |
| `app/api/checkout/create-payment-intent/route.ts` | Creates Stripe PaymentIntent + saves order to DB |
| `app/api/webhooks/stripe/route.ts` | Handles payment_intent.succeeded, payment_failed, charge.refunded |
| `lib/email.ts` | Sends order confirmation emails |

### Webhook Events Handled

| Event | Action |
|---|---|
| `payment_intent.succeeded` | Updates order to "paid" + "processing", clears cart, sends email |
| `payment_intent.payment_failed` | Updates order to "failed" + "cancelled" |
| `charge.refunded` | Records refund, updates payment status |

### Stripe Environment Variables

```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Deployment (Dokploy)

### Infrastructure

- **Hosting**: Dokploy at `dokploy.learnnovice.com`
- **Container**: Docker (multi-stage build, Node.js 20 slim)
- **Output**: Next.js standalone mode
- **Port**: 3000

### Docker Build

The `Dockerfile` uses a 3-stage build:
1. **deps** — Installs node_modules
2. **builder** — Builds Next.js application
3. **runner** — Minimal production image with only standalone output

### Required Dokploy Environment Variables

Set these in Dokploy's application settings:

```
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://modestummah.com
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
JWT_SECRET=your-production-jwt-secret
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Deployment Process

1. Push to `main` branch on GitHub
2. GitHub Actions runs quality checks + build
3. If checks pass, GitHub Actions calls Dokploy API to trigger deployment
4. Dokploy pulls the latest code, builds Docker image, deploys

---

## CI/CD (GitHub Actions)

### Workflow: `.github/workflows/ci-cd.yml`

```
Push to main
  ├── Job 1: quality (lint + type check)
  ├── Job 2: build (npm run build)
  └── Job 3: deploy (trigger Dokploy API)
```

### Pipeline Details

| Job | Description | Runs On |
|---|---|---|
| **quality** | Runs `npm run lint` and `npx tsc --noEmit` | Every push + PR |
| **build** | Runs `npm run build` to verify the app compiles | After quality passes |
| **deploy** | Calls Dokploy API with `DOKPLOY_PRE_TEST` secret | Only on push to `main` |

### GitHub Secrets Required

| Secret | Purpose |
|---|---|
| `DOKPLOY_PRE_TEST` | Dokploy API key for triggering deployments |
| `DATABASE_URL` | Neon connection string (for build-time) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (build-time) |

---

## MCP Agent (Dokploy)

The Dokploy MCP agent is configured in `modest-ummah-theme/.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "dokploy-mcp": {
      "command": "npx",
      "args": ["-y", "@ahdev/dokploy-mcp"],
      "env": {
        "DOKPLOY_URL": "https://dokploy.learnnovice.com/api",
        "DOKPLOY_API_KEY": "your-api-key"
      }
    }
  }
}
```

This allows AI assistants to directly interact with Dokploy for:
- Checking deployment status
- Viewing application logs
- Triggering deployments
- Managing environment variables

---

## Environment Variables

### Complete Reference

```env
# ─── Required ──────────────────────────────
DATABASE_URL=postgresql://...            # Neon PostgreSQL connection string
JWT_SECRET=...                           # Random string for JWT signing (min 32 chars)
STRIPE_SECRET_KEY=sk_...                 # Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_...          # Stripe webhook signing secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_... # Stripe publishable key

# ─── Recommended ───────────────────────────
NEXT_PUBLIC_APP_URL=https://modestummah.com  # Public URL
NEXT_PUBLIC_APP_NAME="Modest Ummah"          # Display name

# ─── Optional / Legacy ────────────────────
NEXT_PUBLIC_POCKETBASE_URL=...           # Kept for legacy image URL support
TAXCLOUD_API_LOGIN_ID=...               # Tax calculation API
PIRATESHIP_API_KEY=...                  # Pirate Ship API (for future automation)
GOOGLE_CLIENT_ID=...                    # Google OAuth (future)
NEXT_PUBLIC_GA_TRACKING_ID=...          # Google Analytics
```

---

## File Structure

```
vibe_modest/
├── app/
│   ├── admin/                    # Admin panel pages
│   │   ├── dashboard/page.tsx    # Analytics dashboard (recharts)
│   │   ├── orders/page.tsx       # Orders list + Pirate Ship export
│   │   ├── orders/[id]/page.tsx  # Single order detail
│   │   ├── customers/page.tsx    # Customer list with stats
│   │   ├── products/page.tsx     # Product management
│   │   ├── settings/page.tsx     # Store settings
│   │   ├── login/page.tsx        # Admin login
│   │   ├── layout.tsx            # Admin layout + auth gate
│   │   └── page.tsx              # Redirects to /dashboard
│   │
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts        # POST — User login
│   │   │   ├── register/route.ts     # POST — User registration
│   │   │   └── admin-login/route.ts  # POST — Admin login
│   │   ├── admin/
│   │   │   ├── stats/route.ts        # GET — Dashboard analytics
│   │   │   └── orders/export/route.ts # POST — Pirate Ship CSV
│   │   ├── checkout/
│   │   │   └── create-payment-intent/route.ts
│   │   ├── data/route.ts            # GET — Generic collection queries
│   │   └── webhooks/
│   │       └── stripe/route.ts      # POST — Stripe webhook handler
│   │
│   ├── account/                 # Customer account pages
│   ├── auth/                    # Login/Register pages
│   ├── product/[slug]/          # Product detail page
│   ├── shop/                    # Product listing
│   └── layout.tsx               # Root layout
│
├── components/
│   ├── admin/                   # Admin-specific components
│   │   ├── admin-nav.tsx        # Sidebar navigation
│   │   ├── admin-login-form.tsx # Login form
│   │   ├── product-editor.tsx   # Product create/edit form
│   │   └── product-form.tsx     # Product form fields
│   ├── auth/                    # Auth forms
│   ├── home/                    # Homepage sections
│   ├── product/                 # Product components
│   ├── providers/               # Context providers
│   │   └── auth-provider.tsx    # Auth state initialization
│   ├── shop/                    # Shop components
│   └── ui/                      # shadcn/ui components
│
├── lib/
│   ├── schema.ts                # Drizzle schema definitions ★
│   ├── db.ts                    # Drizzle client (Neon) ★
│   ├── auth.ts                  # JWT + password utils ★
│   ├── admin-helpers.ts         # Dashboard stats + CSV export ★
│   ├── pocketbase.ts            # Compatibility layer (Drizzle-backed) ★
│   ├── store.ts                 # Zustand stores (cart, auth, UI)
│   ├── stripe.ts                # Stripe SDK helpers
│   ├── email.ts                 # Email sending (order confirmation)
│   └── utils.ts                 # Utility functions
│
├── types/
│   ├── index.ts                 # App-wide TypeScript types
│   └── pocketbase-types.ts      # Legacy types (PB SDK removed)
│
├── scripts/
│   └── seed-admin.ts            # Database seeder for admin account ★
│
├── .github/
│   └── workflows/
│       └── ci-cd.yml            # GitHub Actions pipeline ★
│
├── drizzle.config.ts            # Drizzle Kit configuration ★
├── Dockerfile                   # Multi-stage Docker build
├── docker-compose.yml           # Docker Compose config
├── .env                         # Environment variables
├── .env.example                 # Template for env vars
└── package.json                 # Dependencies + scripts
```

Files marked with ★ are new or significantly modified in the Neon migration.

---

## Setup Guide

### Prerequisites

- **Node.js 20+** installed
- **Neon account** — Sign up free at [console.neon.tech](https://console.neon.tech)
- **Stripe account** — For payment processing
- **GitHub repository** — For CI/CD
- **Dokploy instance** — At `dokploy.learnnovice.com`

### Step-by-Step

```bash
# 1. Clone and install
cd vibe_modest
npm install

# 2. Set up Neon database
#    - Go to console.neon.tech
#    - Create a new project
#    - Copy the connection string

# 3. Configure environment
#    - Open .env
#    - Paste your DATABASE_URL
#    - Set a strong JWT_SECRET
#    - Configure Stripe keys

# 4. Push schema to database
npm run db:push

# 5. Seed admin account
npx tsx scripts/seed-admin.ts

# 6. Start development server
npm run dev

# 7. Visit http://localhost:3000
#    Admin: http://localhost:3000/admin/login
```

### Production Deployment

```bash
# 1. Ensure all env vars are set in Dokploy
# 2. Push to main branch
# 3. GitHub Actions will automatically:
#    a. Lint + type check
#    b. Build
#    c. Trigger Dokploy deployment
```

---

## Common Tasks

### Add a New Admin

```bash
# Using the seed script (modify email/password in the script)
npx tsx scripts/seed-admin.ts

# Or via SQL in Neon Console:
INSERT INTO admins (email, name, password_hash) 
VALUES ('newaadmin@modestummah.com', 'New Admin', '$2a$12$...');
```

### Export Orders to Pirate Ship

1. Go to `/admin/orders`
2. Filter orders by status (e.g., "processing")
3. Select orders via checkboxes (or export all)
4. Click "Export for Pirate Ship"
5. Upload CSV to Pirate Ship Bulk Import

### Add a New Product

1. Go to `/admin/products`
2. Click "Add Product"
3. Fill in product details (name, price, images, sizes, colors)
4. Click "Save"

### View Analytics

1. Go to `/admin/dashboard`
2. View revenue chart (hover for exact amounts)
3. View order status distribution
4. View top-selling items

---

## Troubleshooting

### "DATABASE_URL is not set"

- Ensure your `.env` file has a valid `DATABASE_URL` value
- The format should be: `postgresql://user:password@host/database?sslmode=require`
- Get your connection string from [console.neon.tech](https://console.neon.tech)

### "Invalid admin credentials"

- Run `npx tsx scripts/seed-admin.ts` to create the admin account
- Default: `admin@modestummah.com` / `ModestAdmin2026`
- Make sure the `admins` table exists (`npm run db:push`)

### "Cannot find module 'drizzle-orm'"

- Run `npm install` to install all dependencies
- Check that `drizzle-orm` and `@neondatabase/serverless` are in `package.json`

### Build Fails in Docker

- Ensure `DATABASE_URL` is passed as a build arg in Dokploy
- The build needs database access for type checking

### Stripe Webhook Not Firing

- Check your `STRIPE_WEBHOOK_SECRET` matches the webhook in Stripe Dashboard
- Ensure the webhook URL points to your production domain: `https://modestummah.com/api/webhooks/stripe`
- Use `stripe listen --forward-to localhost:3000/api/webhooks/stripe` for local testing

### GitHub Actions Deploy Fails

- Verify `DOKPLOY_PRE_TEST` secret is set in GitHub repository settings
- Check the Dokploy API endpoint URL in `.github/workflows/ci-cd.yml`
- The deploy endpoint may need adjustment based on your Dokploy API version

---

## API Reference

### Authentication

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` | User login |
| POST | `/api/auth/register` | `{ email, password, name }` | User registration |
| POST | `/api/auth/admin-login` | `{ email, password }` | Admin login |

### Admin (Requires admin_token cookie)

| Method | Endpoint | Body | Description |
|---|---|---|---|
| GET | `/api/admin/stats` | — | Dashboard analytics |
| POST | `/api/admin/orders/export` | `{ orderIds?: string[] }` | Pirate Ship CSV export |

### Data

| Method | Endpoint | Params | Description |
|---|---|---|---|
| GET | `/api/data` | `collection, page, perPage, filter` | Generic collection query |

### Checkout

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/checkout/create-payment-intent` | `{ amount, orderId, customerEmail, ... }` | Create Stripe PaymentIntent |

### Webhooks

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/webhooks/stripe` | Stripe webhook handler |

---

## Migration Notes

### What Changed (PocketBase → Neon)

| Component | Before (PocketBase) | After (Neon + Drizzle) |
|---|---|---|
| **Database** | SQLite via PocketBase server | PostgreSQL via Neon (serverless) |
| **ORM** | PocketBase SDK | Drizzle ORM |
| **Auth** | PocketBase built-in auth | Custom JWT (jose + bcryptjs) |
| **File Storage** | PocketBase file uploads | External URLs (or S3/CDN) |
| **Realtime** | PocketBase subscriptions | Not implemented (use polling) |
| **Admin Auth** | PocketBase admin API | Separate admins table + JWT |
| **API Layer** | PocketBase REST API | Custom Next.js API routes |

### Backward Compatibility

The migration keeps backward compatibility via `lib/pocketbase.ts`:

- **Same function names**: `getProducts()`, `signIn()`, `adminSignIn()`, `getAllOrders()`, etc.
- **Same types**: `Product`, `Order`, `User`, `Cart` types in `types/index.ts` unchanged
- **Same auth store interface**: `getPocketBase().authStore.isValid`, `.model`, `.clear()`, `.onChange()`
- **Components unchanged**: Login forms, register forms, product cards, cart — all import from `@/lib/pocketbase` and work without changes

### Data Migration

If you have existing data in PocketBase that needs to be migrated to Neon:

1. Export data from PocketBase (use admin UI or API)
2. Transform to match the new schema
3. Import into Neon using Drizzle or raw SQL

### Features Not Yet Migrated

| Feature | Status | Notes |
|---|---|---|
| **Google OAuth** | ❌ Not migrated | Requires setting up Google Cloud OAuth credentials + custom callback flow |
| **Realtime cart sync** | ❌ Not migrated | PocketBase had WebSocket subscriptions; use polling or implement SSE |
| **File uploads** | ⚠️ Partial | Images stored as URLs (not file uploads); need S3/CDN for new uploads |

---

## Technical Notes

### Drizzle Schema Patterns

The schema uses JSONB columns for complex nested data (cart items, shipping addresses, product colors). This avoids junction tables for simple embedded data while maintaining PostgreSQL's JSONB query capabilities.

### Auth Token Structure

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "name": "John",
  "type": "user",  // or "admin"
  "iss": "modest-ummah",
  "iat": 1711836000,
  "exp": 1712440800
}
```

### Pirate Ship CSV Schema

The CSV follows Pirate Ship's exact bulk import format. The weight field uses ounces (8 oz per item × quantity), and dimensions use standard US small parcel sizing (12×9×4 inches). These are USPS-compliant for First Class and Priority Mail.

### Dashboard Aggregation

The dashboard stats are computed server-side in `lib/admin-helpers.ts` using Drizzle aggregation queries:
- Revenue trends use `to_char()` for monthly grouping
- Most-sold items are aggregated from items JSON in all paid orders
- Percentage changes compare current 30-day window to the previous 30-day window

---

*This document is the single source of truth for the Modest Ummah project. Update it whenever significant changes are made.*
