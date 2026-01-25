# Modest Ummah - Complete Project Documentation

## 🎯 Project Overview

**Modest Ummah** is a full-stack e-commerce platform for modest Islamic fashion. Built with modern technologies, it provides a premium shopping experience for men's and women's modest clothing, hijabs, thobes, and Islamic accessories.

**Live URL:** https://modestummah.com  
**Admin Panel:** https://modestummah.com/admin  
**PocketBase Admin:** https://pb.modestummah.com/_/

---

## 🛠️ Technologies Used

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 15.1.3 | React framework with App Router, SSR, and API routes |
| **React** | 19 | UI component library |
| **TypeScript** | 5.x | Type-safe JavaScript |
| **Tailwind CSS** | 3.4 | Utility-first CSS framework |
| **shadcn/ui** | Latest | Accessible, customizable UI components |
| **Lucide Icons** | Latest | Beautiful SVG icon library |
| **Zustand** | 5.x | Lightweight state management |
| **React Hook Form** | 7.x | Form handling with validation |
| **Zod** | 3.x | Schema validation |

### Backend & Database
| Technology | Purpose |
|------------|---------|
| **PocketBase** | Backend-as-a-Service (BaaS) - Authentication, database, file storage |
| **SQLite** | Embedded database (via PocketBase) |

### Payments & Commerce
| Service | Purpose |
|---------|---------|
| **Stripe** | Payment processing, checkout, webhooks |
| **Stripe Elements** | Secure payment form components |

### Email & Communications
| Service | Purpose |
|---------|---------|
| **Brevo (Sendinblue)** | Transactional email - order confirmations, shipping notifications |

### Shipping
| Service | Purpose |
|---------|---------|
| **Pirate Ship** | USPS commercial shipping rates (fallback rates implemented) |

### Infrastructure & Deployment
| Service | Purpose |
|---------|---------|
| **Coolify** | Self-hosted PaaS for Docker deployments |
| **Google Cloud Platform** | VM hosting (e2-medium instance) |
| **Cloudflare** | DNS management, SSL, CDN, DDoS protection |
| **Docker** | Containerization |
| **Docker Compose** | Multi-container orchestration |

### Development Tools
| Tool | Purpose |
|------|---------|
| **Git/GitHub** | Version control |
| **ESLint** | Code linting |
| **Prettier** | Code formatting |
| **next-pwa** | Progressive Web App support |
| **next-sitemap** | SEO sitemap generation |

---

## 🔗 Third-Party Integrations

### 1. Stripe Payments
- **Purpose:** Process credit card payments
- **Integration Points:**
  - Checkout page with Stripe Elements
  - Payment Intent API (`/api/checkout/payment-intent`)
  - Webhook handler (`/api/webhooks/stripe`)
- **Events Handled:**
  - `checkout.session.completed`
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `charge.refunded`

### 2. PocketBase
- **Purpose:** Backend database, authentication, file storage
- **Collections:**
  - `users` - Customer accounts (Auth collection)
  - `products` - Product catalog
  - `orders` - Order records
  - `carts` - Shopping carts
- **Features Used:**
  - Email/password authentication
  - Google OAuth (configured)
  - File uploads for product images
  - Real-time subscriptions (optional)

### 3. Brevo (Email)
- **Purpose:** Transactional emails
- **Email Templates:**
  - Order confirmation
  - Shipping notification
  - Welcome email
  - Password reset

### 4. Cloudflare
- **Purpose:** DNS, SSL, CDN
- **Configuration:**
  - A record for root domain → GCP VM
  - A record for `pb` subdomain → PocketBase
  - SSL mode: Full
  - WWW to non-WWW redirect rule

---

## 🚧 Problems Faced & Solutions

### 1. Mixed Content Error (HTTPS/HTTP)
**Problem:** The main site was HTTPS but PocketBase was HTTP, causing browsers to block requests.

**Solution:** 
- Created a subdomain `pb.modestummah.com` 
- Configured SSL via Cloudflare proxy
- Updated `NEXT_PUBLIC_POCKETBASE_URL` to use HTTPS

---

### 2. Docker Build Failures
**Problem:** `npm run build` failed in Docker due to TypeScript type errors.

**Solution:**
- Fixed `ProductFormData` type mismatch (`ProductColor[]` vs `string[]`)
- Added proper type imports
- Verified build locally before pushing

---

### 3. Let's Encrypt Rate Limits with sslip.io
**Problem:** Coolify warned that Let's Encrypt SSL wouldn't work with sslip.io domains.

**Solution:**
- Used custom subdomain (`pb.modestummah.com`) 
- Leveraged Cloudflare's SSL proxy instead of Let's Encrypt

---

### 4. PocketBase Image Upload via API
**Problem:** Seed script couldn't upload images using URL strings - PocketBase expects file uploads.

**Solution:**
- Created native Node.js script using multipart/form-data
- Downloaded images from Pexels
- Uploaded as binary file data via PATCH request

---

### 5. Environment Variables Not Loading
**Problem:** Next.js wasn't reading environment variables in Docker.

**Solution:**
- Used build-time ARGs in Dockerfile for `NEXT_PUBLIC_*` variables
- Passed runtime ENV for server-side secrets
- Configured Coolify to pass env vars during build

---

### 6. Port Configuration in Coolify
**Problem:** Service became unreachable after domain changes.

**Solution:**
- Kept port 8080 for PocketBase (required)
- Used port 3000 for Next.js
- Properly configured Traefik routing via Coolify

---

## 📁 Project Structure

```
modest-ummah/
├── app/                          # Next.js App Router
│   ├── (routes)/                 # Public pages
│   │   ├── page.tsx              # Homepage
│   │   ├── shop/                 # Shop pages
│   │   ├── product/[slug]/       # Product detail
│   │   ├── cart/                 # Shopping cart
│   │   ├── checkout/             # Checkout flow
│   │   ├── auth/                 # Login/Register
│   │   └── account/              # User account
│   ├── admin/                    # Admin dashboard
│   │   ├── products/             # Product management
│   │   ├── orders/               # Order management
│   │   └── customers/            # Customer list
│   └── api/                      # API routes
│       ├── checkout/             # Payment APIs
│       ├── shipping/             # Shipping rates
│       └── webhooks/             # Stripe webhooks
├── components/                   # React components
│   ├── ui/                       # shadcn/ui components
│   ├── layout/                   # Header, Footer, etc.
│   ├── product/                  # Product components
│   ├── cart/                     # Cart components
│   ├── checkout/                 # Checkout components
│   └── admin/                    # Admin components
├── lib/                          # Utility libraries
│   ├── pocketbase.ts             # PocketBase client
│   ├── stripe.ts                 # Stripe client
│   ├── email.ts                  # Brevo integration
│   ├── shipping.ts               # Shipping calculations
│   ├── store.ts                  # Zustand stores
│   └── utils.ts                  # Helper functions
├── types/                        # TypeScript types
├── public/                       # Static assets
├── scripts/                      # Utility scripts
│   ├── seed-products.js          # Database seeder
│   └── upload-images-native.js   # Image uploader
├── docker-compose.yml            # Container orchestration
├── Dockerfile                    # Production build
└── .env.example                  # Environment template
```

---

## 🔐 Environment Variables

### Required Variables
```env
# App
NEXT_PUBLIC_APP_URL=https://modestummah.com
NEXT_PUBLIC_APP_NAME=Modest Ummah

# PocketBase
NEXT_PUBLIC_POCKETBASE_URL=https://pb.modestummah.com

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Email
BREVO_API_KEY=xkeysib-xxx
```

### Optional Variables
```env
# Shipping Origin
PIRATESHIP_ORIGIN_NAME=Modest Ummah
PIRATESHIP_ORIGIN_STREET1=387 Wallace Way
PIRATESHIP_ORIGIN_CITY=Romeoville
PIRATESHIP_ORIGIN_STATE=IL
PIRATESHIP_ORIGIN_ZIP=60446

# Analytics
NEXT_PUBLIC_GA_TRACKING_ID=G-xxx
```

---

## 🚀 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Cloudflare                            │
│  (DNS, SSL Proxy, CDN, DDoS Protection)                     │
├─────────────────────────────────────────────────────────────┤
│  modestummah.com ─────────► GCP VM (35.196.155.128)         │
│  pb.modestummah.com ──────► GCP VM (35.196.155.128)         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Coolify (Self-hosted)                    │
│                   Docker Container Manager                   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │   Next.js App   │    │   PocketBase    │                 │
│  │   (Port 3000)   │    │   (Port 8080)   │                 │
│  │                 │    │                 │                 │
│  │  - Frontend     │◄──►│  - Database     │                 │
│  │  - API Routes   │    │  - Auth         │                 │
│  │  - SSR          │    │  - Files        │                 │
│  └─────────────────┘    └─────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Features Implemented

### Customer Features
- [x] Product browsing with categories and filters
- [x] Product search with instant results
- [x] Product detail pages with image gallery
- [x] Size and color selection
- [x] Shopping cart with persistence
- [x] Guest checkout
- [x] User registration and login
- [x] Google OAuth login
- [x] User account dashboard
- [x] Order history
- [x] Wishlist functionality
- [x] Address management
- [x] Responsive design (mobile-first)
- [x] PWA support (installable app)

### Checkout Features
- [x] Secure Stripe payment processing
- [x] Real-time shipping rate calculation
- [x] Tax calculation (fallback rates)
- [x] Order confirmation emails
- [x] Shipping notification emails

### Admin Features
- [x] Secure admin login
- [x] Product management (CRUD)
- [x] Image upload for products
- [x] Order management
- [x] Order status updates
- [x] Customer list view
- [x] Dashboard with statistics

---

## 🎨 Design System

### Colors
```css
--sage-50: #f6f7f6
--sage-100: #e3e7e3
--sage-500: #8B7355  /* Primary brand color */
--sage-600: #7a6549
--sage-700: #5d4d38
```

### Typography
- **Headings:** Playfair Display (serif)
- **Body:** Inter (sans-serif)

### Components
- Built on shadcn/ui (Radix primitives)
- Custom styling with Tailwind CSS
- Dark mode support (optional)

---

## 💬 Complete Prompt to Recreate This Website

The following is a comprehensive prompt that can be used to recreate the entire Modest Ummah e-commerce website from scratch. This prompt covers every aspect of the project:

---

### 🚀 THE MASTER PROMPT

```
Create a complete, production-ready e-commerce website for "Modest Ummah" - an Islamic modest fashion store selling men's and women's clothing, hijabs, thobes, and Islamic accessories.

## BRAND IDENTITY
- Name: Modest Ummah
- Tagline: "Modest fashion for the modern Muslim family"
- Style: Elegant, premium, warm earthy tones
- Primary color: Sage/Brown (#8B7355)
- Fonts: Playfair Display (headings), Inter (body)

## TECH STACK (Required)
- Frontend: Next.js 15 with App Router, TypeScript, Tailwind CSS
- UI Components: shadcn/ui (install with npx shadcn-ui@latest init)
- State Management: Zustand
- Forms: React Hook Form + Zod validation
- Backend: PocketBase (self-hosted BaaS)
- Payments: Stripe with Payment Intents API
- Email: Brevo (Sendinblue) transactional API
- Shipping: Calculate rates based on weight/zone (fallback rates)
- Deployment: Docker + Docker Compose

## DATABASE SCHEMA (PocketBase Collections)

### products (Base collection)
- name: text (required)
- slug: text (required, unique)
- description: text
- shortDescription: text  
- price: number (required)
- compareAtPrice: number (for sale prices)
- category: select (men, women, accessories)
- subcategory: text
- images: file (multiple)
- colors: json (array of {name, value})
- sizes: json (array of strings)
- tags: json (array of strings)
- featured: boolean
- inStock: boolean
- stockQuantity: number
- sku: text
- weight: number (ounces)

### users (Auth collection)
- name: text
- avatar: file
- phone: text
- addresses: json

### orders (Base collection)
- orderId: text (unique, e.g., "ORD-123456")
- user: relation to users (optional for guest checkout)
- email: text
- items: json
- shippingAddress: json
- billingAddress: json
- subtotal: number
- shipping: number
- tax: number
- total: number
- status: select (pending, processing, shipped, delivered, cancelled)
- paymentStatus: select (pending, paid, failed, refunded)
- paymentIntentId: text
- trackingNumber: text
- notes: text

### carts (Base collection)
- user: relation to users
- items: json
- updatedAt: date

## PAGE STRUCTURE

### Public Pages
1. **Homepage (/)** 
   - Hero section with featured collection image
   - Announcement bar (free shipping over $75)
   - Featured products grid (8 products)
   - Category cards (Men, Women, Accessories)
   - Testimonials section
   - Newsletter signup

2. **Shop (/shop)**
   - Product grid with filters (category, price, size, color)
   - Sort options (newest, price low-high, price high-low)
   - Pagination
   - Category filtering via URL params

3. **Product Detail (/product/[slug])**
   - Image gallery with zoom
   - Size selector
   - Color selector (color swatches)
   - Add to cart button
   - Product description tabs
   - Related products section

4. **Cart (/cart)**
   - Cart items with quantity controls
   - Remove item button
   - Subtotal calculation
   - Free shipping progress bar
   - Continue shopping / Checkout buttons

5. **Checkout (/checkout)**
   - Shipping address form
   - Shipping method selection
   - Payment form (Stripe Elements)
   - Order summary sidebar
   - Place order button

6. **Order Confirmation (/checkout/confirmation)**
   - Order details display
   - Thank you message
   - Order number

7. **Authentication**
   - Login (/auth/login)
   - Register (/auth/register)
   - Forgot password (/auth/forgot-password)

8. **Account Dashboard (/account)**
   - Order history
   - Addresses management
   - Wishlist
   - Account settings

9. **Static Pages**
   - About (/about)
   - Contact (/contact)
   - FAQ (/faq)

### Admin Pages (/admin)
Protect with admin-only authentication

1. **Dashboard (/admin)**
   - Total revenue stat
   - Total orders stat
   - Total customers stat
   - Recent orders table

2. **Products (/admin/products)**
   - Products table with search
   - Add/Edit/Delete products
   - Product form with image upload

3. **Orders (/admin/orders)**
   - Orders table with status filters
   - Order detail page
   - Update status functionality

4. **Customers (/admin/customers)**
   - Customers list
   - Order count per customer

## KEY FEATURES TO IMPLEMENT

### Shopping Cart
- Persist cart in Zustand with localStorage
- Sync with PocketBase for logged-in users
- Quantity controls with stock limits
- Automatic subtotal calculation

### Checkout Flow
1. Guest checkout allowed
2. Collect shipping address
3. Calculate shipping rates based on:
   - Package weight
   - Destination state (zone-based)
4. Calculate tax (simplified: 7-10% based on state)
5. Create Stripe PaymentIntent
6. On successful payment, create order in PocketBase
7. Send confirmation email via Brevo
8. Clear cart

### Stripe Integration
- Use Payment Intents API (not Checkout Sessions)
- Implement webhook handler for:
  - payment_intent.succeeded → create order
  - payment_intent.payment_failed → handle failure
  - charge.refunded → update order
- Include CardElement for payment input

### Email Templates (Brevo)
1. Order Confirmation
   - Order number
   - Items list with images
   - Shipping address
   - Order totals
   - Branded header/footer

2. Shipping Notification
   - Tracking number
   - Carrier name
   - Track package button

3. Welcome Email
   - Personalized greeting
   - Brand introduction

### Responsive Design
- Mobile-first approach
- Breakpoints: sm(640px), md(768px), lg(1024px), xl(1280px)
- Mobile menu with slide-out drawer
- Touch-friendly buttons and inputs

### SEO
- Unique meta titles and descriptions per page
- Open Graph tags
- Structured data (JSON-LD) for products
- Sitemap generation (next-sitemap)
- Robots.txt

### Performance
- Image optimization with next/image
- Lazy loading for below-fold content
- ISR for product pages
- Edge caching headers

## DOCKER DEPLOYMENT

Create docker-compose.yml with:
1. nextjs service (build from Dockerfile)
2. pocketbase service (image: ghcr.io/muchobien/pocketbase)

The Next.js Dockerfile should:
- Use node:18-alpine
- Install dependencies
- Build the app
- Create production image with standalone output

## ENVIRONMENT VARIABLES

NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_POCKETBASE_URL=https://your-pocketbase-url
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_xxx
STRIPE_SECRET_KEY=sk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
BREVO_API_KEY=xkeysib-xxx

## STYLING GUIDELINES

- Use CSS variables for theming
- Consistent spacing (4px base unit)
- Rounded corners (border-radius: 0.5rem)
- Subtle shadows for depth
- Smooth transitions (150ms ease)
- Hover states on all interactive elements

## COMPONENT LIBRARY

Install these shadcn/ui components:
- button, input, label, card
- select, checkbox, radio
- dialog, sheet (mobile menu)
- toast (notifications)
- tabs, accordion
- skeleton (loading states)
- dropdown-menu
- form
- table

## FOLDER STRUCTURE

/app - Next.js App Router pages
/components - React components
  /ui - shadcn components
  /layout - Header, Footer, etc.
  /product - Product-related components
  /cart - Cart components
  /checkout - Checkout components
  /admin - Admin components
/lib - Utility functions
  pocketbase.ts - PocketBase client & functions
  stripe.ts - Stripe client & functions
  email.ts - Email sending functions
  shipping.ts - Shipping calculations
  store.ts - Zustand stores
  utils.ts - Helper functions
/types - TypeScript interfaces
/public - Static assets
/scripts - Utility scripts

## ERROR HANDLING

- Implement error boundaries
- Show user-friendly error messages
- Log errors to console in development
- Handle API failures gracefully
- Provide loading states for async operations

## SECURITY

- Validate all inputs with Zod
- Sanitize user content
- Use HTTPS everywhere
- Secure admin routes with authentication
- Store secrets in environment variables
- Enable CORS for PocketBase

Now build this complete e-commerce website step by step, starting with the project setup and working through each feature systematically.
```

---

## 📋 Quick Start Commands

```bash
# Clone and install
git clone https://github.com/Novice130/Modest-Ummah.git
cd modest-ummah
npm install

# Run development
npm run dev

# Run with Docker
docker-compose up -d

# Seed products
node scripts/seed-products.js

# Upload images
node scripts/upload-images-native.js

# Build for production
npm run build
```

---

## 📞 Support

For questions or issues, contact the development team or open an issue on the GitHub repository.

---

**Last Updated:** January 25, 2026  
**Version:** 1.0.0

