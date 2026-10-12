# syntax=docker/dockerfile:1
# Build stage
FROM node:20-slim AS builder

# Increase Node memory for build
ENV NODE_OPTIONS="--max-old-space-size=2048"

WORKDIR /app

# Build-time arguments for Next.js
ARG NEXT_PUBLIC_APP_URL=""
ARG NEXT_PUBLIC_APP_NAME="Modest Ummah"
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=""
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=""
ARG SENTRY_RELEASE=""

ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT}
ENV NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=${NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE}
ENV SENTRY_RELEASE=${SENTRY_RELEASE}

# Copy package files
COPY package.json package-lock.json ./

# Install ALL dependencies (including dev)
RUN npm ci

# Copy source files
COPY . .

# Build the application
# generateStaticParams reads the catalogue, so the build needs a database. The
# URL arrives as a BuildKit secret: present only for this step, never stored in
# a layer or in image history. Builds that pass no secret behave as before.
# sentry_auth_token is the Sentry source-map upload token, delivered the same
# way; without it the build skips the upload.
RUN --mount=type=secret,id=database_url,env=DATABASE_URL \
    --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    npm run build || (echo "=== BUILD FAILED ===" && cat .next/build-error.log 2>/dev/null; exit 1)

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
# Release for the server SDK; SENTRY_DSN / SENTRY_ENVIRONMENT come from the
# runtime environment (the NEXT_PUBLIC_ values are baked into the client).
ARG SENTRY_RELEASE=""
ENV SENTRY_RELEASE=${SENTRY_RELEASE}

# Create non-root user
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nextjs

# Upload volume — must exist and be owned by nextjs before USER switch,
# otherwise the first named-volume mount inherits root ownership and
# /api/upload cannot write.
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

# Copy built files
COPY --from=builder /app/public ./public
# Owned by nextjs so revalidated pages (ISR) can be written back; root-owned
# files made every revalidation log EACCES.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
