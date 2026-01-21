# Build stage
FROM node:20-alpine AS builder

# Increase Node memory for build
ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /app

# Build-time arguments for Next.js public environment variables
ARG NEXT_PUBLIC_APP_URL=""
ARG NEXT_PUBLIC_APP_NAME="Modest Ummah"
ARG NEXT_PUBLIC_POCKETBASE_URL=""
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""

# Set as environment variables for the build
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
ENV NEXT_PUBLIC_POCKETBASE_URL=${NEXT_PUBLIC_POCKETBASE_URL}
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}

# Install libc6-compat for Alpine (sometimes needed for npm packages)
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package.json package-lock.json* ./

# Install ALL dependencies (including dev)
RUN npm ci --legacy-peer-deps 2>&1 || (echo "=== NPM INSTALL FAILED ===" && cat npm-debug.log 2>/dev/null; exit 1)

# Copy source files
COPY . .

# Build the application - capture and display error
RUN npm run build 2>&1 || (echo "========================================" && \
    echo "=== BUILD FAILED - SHOWING ERROR ===" && \
    echo "========================================" && \
    cat .next/trace 2>/dev/null || true && \
    exit 1)

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
