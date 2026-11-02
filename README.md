# Modest Ummah — Islamic Modest Fashion E-Commerce

A full-stack e-commerce store built with **Next.js 16**, **Drizzle ORM**, **Neon PostgreSQL**, and **Stripe**.

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Framer Motion, Recharts
- **Backend:** Next.js API Routes, Drizzle ORM, Neon PostgreSQL (serverless)
- **Auth:** Custom JWT (jose + bcryptjs)
- **Payments:** Stripe
- **Deployment:** Docker image on a Hetzner VPS, run with Docker Compose behind a shared Caddy and Cloudflare

## Deployment

Production is defined in the infra repo (`Novice130/infra`), not here: see
`hetzner/sites/modestummah/` and `docs/runbook.md` there. Operations run from the
Mac with that repo's `bin/prod` (`status`, `deploy`, `rollback`, `maintenance`).
Dokploy is not the production path. `docker-compose.yml` and `PROJECT_NOTES.md`
date from earlier hosting and do not describe production, and
`.github/workflows/ci-cd.yml` is not used to deploy production.

## Quick Start

```bash
# Install dependencies
npm ci --legacy-peer-deps

# Set up environment
cp .env.example .env
# Edit .env with your development Neon + Stripe credentials

# Create the schema on a new, empty development database only
npx drizzle-kit migrate

# Start development server
npm run dev
```

Never point these commands at production. Schema changes follow
[docs/database-migrations.md](./docs/database-migrations.md).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run db:generate` | Generate a migration from `lib/schema.ts` (offline) |
| `npm run db:studio` | Open Drizzle Studio |
| `node scripts/compare-schema.mjs` | Read-only: compare a database with `lib/schema.ts` |

## Documentation

- [docs/database-migrations.md](./docs/database-migrations.md): database history and schema changes.
- [PROJECT_NOTES.md](./PROJECT_NOTES.md): historic architecture notes, not current deployment.

## License

Private — All rights reserved.
