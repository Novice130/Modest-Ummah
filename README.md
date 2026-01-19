# Modest Ummah

A production-ready Next.js 15 eCommerce platform for modest Muslim clothing and accessories.

## Features

- **Modern Stack**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Self-hosted PocketBase for data management
- **Payments**: Stripe integration with checkout sessions
- **Auth**: Email/password + Google OAuth via PocketBase
- **SEO**: Dynamic meta tags, schema.org markup, sitemap generation
- **PWA**: Progressive Web App with offline support
- **Performance**: Optimized for Lighthouse 95+ scores
- **Admin Panel**: Product management dashboard

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui, Framer Motion
- **State**: Zustand for client state
- **Backend**: PocketBase (self-hosted)
- **Payments**: Stripe
- **Deployment**: Docker, Nginx

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm
- Docker (for PocketBase)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-repo/modest-ummah.git
cd modest-ummah
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
# Edit .env.local with your values
```

4. Start PocketBase:
```bash
docker compose up pocketbase -d
```

5. Initialize PocketBase:
   - Visit http://localhost:8090/_/
   - Create admin account
   - Import schema from `pocketbase/pb_schema.json`

6. Run the development server:
```bash
npm run dev
```

Visit http://localhost:3000

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── admin/             # Admin panel
│   ├── api/               # API routes
│   ├── auth/              # Authentication pages
│   ├── cart/              # Cart page
│   ├── checkout/          # Checkout flow
│   ├── product/           # Product pages
│   └── shop/              # Shop pages
├── components/            # React components
│   ├── admin/             # Admin components
│   ├── auth/              # Auth components
│   ├── cart/              # Cart components
│   ├── checkout/          # Checkout components
│   ├── home/              # Homepage components
│   ├── layout/            # Layout components
│   ├── product/           # Product components
│   ├── providers/         # Context providers
│   ├── shop/              # Shop components
│   └── ui/                # UI primitives
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities
│   ├── pocketbase.ts      # PocketBase client
│   ├── store.ts           # Zustand stores
│   ├── stripe.ts          # Stripe utilities
│   └── utils.ts           # Helper functions
├── pocketbase/            # PocketBase configuration
├── public/                # Static assets
├── types/                 # TypeScript types
└── nginx/                 # Nginx configuration
```

## Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Sage | #b5c1a0 | Primary |
| Dusty Rose | #d4a3a3 | Accent |
| Mocha | #7b5e57 | Neutral |
| Gold | #eedbb4 | Highlight |
| Navy | #345995 | Text/BG |

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions on deploying to Hostinger VPS.

## Scripts

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run ESLint
```

## License

MIT License - see LICENSE file for details.

## Support

For support, email support@modestummah.com
