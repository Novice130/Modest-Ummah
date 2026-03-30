# Modest Ummah — Islamic Modest Fashion E-Commerce

A full-stack e-commerce store built with **Next.js 16**, **Drizzle ORM**, **Neon PostgreSQL**, and **Stripe**.

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Framer Motion, Recharts
- **Backend:** Next.js API Routes, Drizzle ORM, Neon PostgreSQL (serverless)
- **Auth:** Custom JWT (jose + bcryptjs)
- **Payments:** Stripe
- **Deployment:** Docker → Dokploy, GitHub Actions CI/CD

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your Neon + Stripe credentials

# Push database schema
npm run db:push

# Start development server
npm run dev
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run db:push` | Push schema to Neon |
| `npm run db:studio` | Open Drizzle Studio |

## Documentation

See [PROJECT_NOTES.md](./PROJECT_NOTES.md) for full architecture docs.

## License

Private — All rights reserved.
