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
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

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

RUN npm run build

# ── Stage 2: Serve with Caddy ─────────────────────────────────────────────────
# Caddy serves the built SPA and reverse-proxies /api/* and /widget/* to the api
# container — one image, no nginx/certbot config to maintain.
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
