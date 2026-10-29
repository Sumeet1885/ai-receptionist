# ── WEB image — LOCAL DEVELOPMENT ────────────────────────────────────────────
# This Dockerfile is for LOCAL development only. It is never used by CI.
#
#   • Local dev                → THIS file  (localhost defaults)
#   • CI staging build         → Dockerfile.staging
#   • CI production build      → Dockerfile.prod
#
# VITE_* values point to localhost so the client talks to a locally running
# server. Override any of them at build time with --build-arg if needed.

# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /repo

# Install the pnpm version declared in package.json directly, independent of bundled Corepack.
RUN npm install -g pnpm@10.34.7

# Build context: repository root (pnpm workspace). Every workspace manifest is copied so the
# shared lockfile can be checked (--frozen-lockfile).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY packages/contracts/package.json packages/contracts/
# The image also serves the admin console at /super-admin (see Caddyfile).
RUN pnpm install --frozen-lockfile --filter "@ai-receptionist/web..." --filter "@ai-receptionist/admin..."

COPY packages/contracts packages/contracts
COPY apps/web apps/web
COPY apps/admin apps/admin

# ── LOCAL build-time config (baked into the bundle) ──────────────────────────
# These point to localhost — suitable for running the full stack locally.
# To override: docker build --build-arg VITE_EXPRESS_SERVER_URL=http://... .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_EXPRESS_SERVER_URL
ARG VITE_WIDGET_BASE_URL
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL:-https://xdwcrsydlzprtldkwqzh.supabase.co}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY:-sb_publishable_fvHLCT-vSL2xPmhEzbVBiA__qYmKzey}
ENV VITE_EXPRESS_SERVER_URL=${VITE_EXPRESS_SERVER_URL:-http://localhost:4000}
ENV VITE_WIDGET_BASE_URL=${VITE_WIDGET_BASE_URL:-http://localhost:4000}

ARG VITE_SITE_URL
ARG VITE_INDEXABLE=false
ENV VITE_SITE_URL=${VITE_SITE_URL}
ENV VITE_INDEXABLE=${VITE_INDEXABLE}

RUN pnpm --filter @ai-receptionist/web build && pnpm --filter @ai-receptionist/admin build

# ── Stage 2: Serve with Caddy ─────────────────────────────────────────────────
# Caddy serves the built SPA and reverse-proxies /api/* and /widget/* to the api
# container — one image, no nginx/certbot config to maintain.
FROM caddy:2-alpine
ENV ROBOTS_POLICY="noindex, nofollow, noarchive"
COPY --from=build /repo/apps/web/dist /srv
COPY --from=build /repo/apps/admin/dist /srv/super-admin
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
