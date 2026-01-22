# Build stage
FROM node:20-slim AS builder

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

# Install dependencies required for some node modules (optional but safer)
# RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install ALL dependencies (including dev)
RUN npm ci --legacy-peer-deps

# Copy source files
COPY . .

# Build the application
# echoing logs if it fails
RUN npm run build || (echo "=== BUILD FAILED ===" && cat .next/build-error.log 2>/dev/null; exit 1)

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nextjs

# Copy built files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
