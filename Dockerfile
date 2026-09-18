# syntax=docker/dockerfile:1

# --- Stage 1: Build ---
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency specifications
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies required for build)
RUN npm ci --legacy-peer-deps

# Copy project source code
COPY . .

# Build Vite frontend and bundle Express server to dist/server.cjs
RUN npm run build

# --- Stage 2: Production Runner ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install curl / wget for container health checks
RUN apk add --no-cache wget

# Copy package manifests and install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# Copy built application and server assets
COPY --from=builder /app/dist ./dist

# Copy initial database files (will be overridden if host volume is mounted)
COPY --from=builder /app/server/data ./server/data

# Expose production port
EXPOSE 3000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/health || exit 1

# Start production server
CMD ["node", "dist/server.cjs"]
