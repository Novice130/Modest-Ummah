# Coolify Container Architecture

**Created:** January 21, 2026  
**Purpose:** Document multi-project container setup for Coolify deployment

---

## Server Overview

```
Google Cloud VM (Ubuntu 22.04)
└── Coolify (Self-hosted PaaS)
    ├── Project 1: Modest Ummah (eCommerce)
    ├── Project 2: Attayyibun (Matrimony)
    └── Future projects...
```

---

## Project 1: Modest Ummah (eCommerce)

**Domain:** modestummah.com  
**Type:** Modest Muslim clothing store  
**Client:** US-based (handover after completion)  
**VM IP:** 35.196.155.128  
**Deployment Date:** January 22, 2026

---

## 🚀 Coolify Deployment Walkthrough (Completed Steps)

### Understanding the Architecture

Before diving into steps, here's WHY we're doing this:

```
Internet User → modestummah.com
                    ↓
              Google Cloud VM
                    ↓
               Coolify (PaaS)
                    ↓
         ┌─────────┼─────────┐
         ↓         ↓         ↓
      Nginx    Next.js   PocketBase
    (routing)  (website)  (database)
```

**Why Coolify?** It's like having your own Vercel/Heroku, but self-hosted and FREE. It manages:
- Docker containers (starts/stops/restarts)
- SSL certificates (HTTPS)
- Deployments from GitHub
- Domain routing

---

### Step 1: Configure Google Cloud Firewall

**WHY:** By default, Google Cloud blocks all ports except 80/443. Coolify runs on port 8000, so we must explicitly allow it.

**What we did:**
1. Created firewall rule allowing TCP port 8000
2. Added network tag `coolify` to the rule
3. Added the `coolify` tag to our VM

**Security Note:** In production, you should restrict port 8000 to your IP only, not the whole internet.

---

### Step 2: Create Coolify Admin Account

**WHY:** Coolify needs one "root" admin who controls everything. This is YOU.

**What we did:**
1. Accessed `http://35.196.155.128:8000`
2. Created admin account with strong password
3. Saved credentials securely (this is the master key to your server!)

---

### Step 3: Coolify Initial Setup

**WHY:** Coolify needs to verify it can connect to Docker and create a project to organize our resources.

**What happened:**
- ✅ Server connected (localhost/host.docker.internal)
- ✅ Docker Engine running
- ✅ "My first project" created (we'll rename to Modest Ummah)

---

### Step 4: Add Public Repository

**WHY:** Coolify needs to know WHERE your code lives so it can pull and build it.

**What we did:**
1. Clicked "Public Repository"
2. Entered: `https://github.com/Novice130/Modest-Ummah`
3. Selected branch: `main`

---

### Step 5: Select Docker Compose Build Pack

**WHY:** Your project has multiple services (website + database + nginx) defined in `docker-compose.yml`. The Docker Compose build pack tells Coolify to use that file instead of trying to build a single app.

**Build Pack Options Explained:**
| Build Pack | When to Use |
|------------|-------------|
| Nixpacks | Single app (auto-detects language) |
| Static | HTML/CSS only websites |
| Dockerfile | Single app with custom Dockerfile |
| **Docker Compose** | Multiple services together ← YOUR CHOICE |

**What we did:**
1. Changed Build Pack from "Nixpacks" to "Docker Compose"
2. Fixed file extension: `/docker-compose.yaml` → `/docker-compose.yml`
3. Clicked "Load Compose File"

---

### Step 6: Generate Domains for Each Service

**WHY:** Each container needs its own URL so Coolify knows how to route traffic:

| Service | Domain (sslip.io temporary) | Purpose |
|---------|------------------------------|---------|
| **nextjs** | `http://dg0kow8okc4k4kc48ooog04s.35.196.155.128.sslip.io` | The main website |
| **pocketbase** | `http://lc0gss4sws80440s8koww0ww.35.196.155.128.sslip.io` | Database admin |
| **nginx** | `http://moogs8wo08c848o8kgso8k8s.35.196.155.128.sslip.io` | Reverse proxy |

**What is sslip.io?** A free service that maps domain names to IPs. For example:
- `anything.35.196.155.128.sslip.io` → resolves to `35.196.155.128`

This lets us test before connecting your real domain (`modestummah.com`).

**What we did:**
1. Clicked "Generate Domain" for each of the 3 services
2. Coolify created temporary sslip.io domains

---

### Step 7: Add Environment Variables (NEXT)

**WHY:** Your code needs secret keys (Stripe, database passwords) that shouldn't be in GitHub. Coolify stores these securely and injects them when building.

**Minimum variables needed:**
```env
NEXT_PUBLIC_APP_URL=http://dg0kow8okc4k4kc48ooog04s.35.196.155.128.sslip.io
NEXT_PUBLIC_APP_NAME=Modest Ummah
NEXT_PUBLIC_POCKETBASE_URL=http://lc0gss4sws80440s8koww0ww.35.196.155.128.sslip.io
POCKETBASE_ADMIN_EMAIL=admin@modestummah.com
POCKETBASE_ADMIN_PASSWORD=YourSecurePassword123!
```

---

### Step 8: Deploy (NEXT)

**WHY:** This triggers Coolify to:
1. Pull code from GitHub
2. Build Docker images
3. Start all containers
4. Configure SSL and routing

---

### Container Stack

| Container | Image/Service | Port | Purpose |
|-----------|---------------|------|---------|
| modest-app | Next.js 15 | 3000 | Frontend + API routes |
| modest-pocketbase | PocketBase | 8090 | Database, auth, realtime |
| modest-nocodb | NocoDB | 8080 | Admin panel for client |
| modest-nginx | Nginx | 80/443 | Reverse proxy, SSL |

### Database (PocketBase)

Collections:
- `products` - Product catalog
- `orders` - Customer orders
- `users` - Customer accounts
- `carts` - Shopping carts
- `addresses` - Saved addresses

### Admin Access (NocoDB)

**URL:** admin.modestummah.com (or modestummah.com/admin)

Client will use NocoDB for:
- Managing product inventory
- Viewing/updating orders
- Tracking sales
- Customer management

### External Services

| Service | Purpose | Account Owner |
|---------|---------|---------------|
| Stripe | Payments | Client |
| TaxCloud | Tax calculation | Client |
| Pirate Ship | Shipping labels | Client |

---

## Project 2: Attayyibun (Matrimony)

**Domain:** attayyibun.com  
**Type:** Muslim matrimony/matchmaking platform  
**Data Sensitivity:** HIGH (personal info, messages, preferences)

### Container Stack

| Container | Image/Service | Port | Purpose |
|-----------|---------------|------|---------|
| attayyibun-app | Next.js / React | 3000 | Frontend + API |
| attayyibun-nginx | Nginx | 80/443 | Reverse proxy, SSL |

### Database: Supabase (Recommended)

**Why Supabase over Convex:**

| Factor | Supabase | Convex |
|--------|----------|--------|
| **Row-Level Security** | Excellent (critical for private profiles) | Limited |
| **Maturity** | Production-ready, widely used | Newer, less battle-tested |
| **PostgreSQL** | Full SQL for complex matching queries | NoSQL-like |
| **Auth** | Built-in with social providers | Requires integration |
| **Hosting** | Managed cloud option available | Managed only |
| **Storage** | Built-in for profile photos | Requires separate setup |
| **Realtime** | Built-in for chat/notifications | Excellent |

**Supabase is better for matrimony because:**
1. Row-level security ensures users only see authorized profiles
2. PostgreSQL handles complex matching algorithms well
3. Built-in auth with email verification
4. File storage for profile photos with access control
5. Audit logs for compliance

### Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| Data isolation | Separate Supabase project (not shared) |
| Row-level security | PostgreSQL RLS policies |
| Profile privacy | Users control who sees their info |
| Message encryption | End-to-end for private messages |
| Admin access | Supabase Studio (built-in admin) |
| Audit logging | Track who accessed what |

### Admin Access

**URL:** Supabase Studio (studio.supabase.com) or self-hosted

Unlike NocoDB, Supabase has its own admin dashboard:
- Supabase Studio for database management
- Built-in user management
- SQL editor for reports
- No need for separate admin container

---

## Security: Why Separate Everything

```
WRONG (Security Risk):
┌─────────────────────────────┐
│ Shared NocoDB               │
│ ├── Modest Ummah DB         │
│ └── Attayyibun DB           │ ← One breach = both exposed
└─────────────────────────────┘

CORRECT (Isolated):
┌─────────────────────────────┐
│ Project: Modest Ummah       │
│ └── PocketBase + NocoDB     │ ← Isolated
└─────────────────────────────┘
┌─────────────────────────────┐
│ Project: Attayyibun         │
│ └── Supabase (managed)      │ ← Completely separate
└─────────────────────────────┘
```

---

## Coolify Setup Order

### Phase 1: Install Coolify
- [ ] SSH into Google Cloud VM
- [ ] Run Coolify install script
- [ ] Access Coolify dashboard
- [ ] Configure SSL with Let's Encrypt

### Phase 2: Deploy Modest Ummah
- [ ] Create "Modest Ummah" project in Coolify
- [ ] Add PocketBase container
- [ ] Add Next.js app container
- [ ] Add NocoDB container
- [ ] Add Nginx container
- [ ] Configure domain: modestummah.com
- [ ] Import PocketBase schema
- [ ] Connect NocoDB to PocketBase
- [ ] Test full checkout flow

### Phase 3: Handover to Client
- [ ] Create client accounts for all services
- [ ] Document NocoDB usage for inventory management
- [ ] Transfer Stripe/TaxCloud/PirateShip accounts
- [ ] Provide admin credentials

### Phase 4: Deploy Attayyibun (Future)
- [ ] Create "Attayyibun" project in Coolify
- [ ] Set up Supabase project (cloud or self-hosted)
- [ ] Build matrimony app
- [ ] Configure domain: attayyibun.com
- [ ] Implement security/privacy features

---

## Resource Allocation (Estimated)

| Project | RAM | CPU | Storage |
|---------|-----|-----|---------|
| Coolify | 512MB | 0.5 | 2GB |
| Modest Ummah (all containers) | 1.5GB | 1 | 10GB |
| Attayyibun (app only, Supabase cloud) | 512MB | 0.5 | 5GB |
| **Total** | ~2.5GB | 2 | 17GB |

**Recommended VM:** e2-medium (2 vCPU, 4GB RAM) or better

---

## Notes

- Each project in Coolify is isolated by default
- NocoDB is ONLY for Modest Ummah (eCommerce)
- Attayyibun uses Supabase's built-in admin (Supabase Studio)
- Never share database credentials between projects
- Matrimony data requires stricter security than eCommerce

---

*Last Updated: January 21, 2026*
