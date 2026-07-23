FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite embeds these at build time.
# Accept build args (may arrive empty from CI), then fall back to defaults.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_EXPRESS_SERVER_URL
ARG VITE_WIDGET_BASE_URL
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL:-https://xdwcrsydlzprtldkwqzh.supabase.co}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY:-sb_publishable_fvHLCT-vSL2xPmhEzbVBiA__qYmKzey}
ENV VITE_EXPRESS_SERVER_URL=${VITE_EXPRESS_SERVER_URL:-https://reception.clarusgrid.online}
ENV VITE_WIDGET_BASE_URL=${VITE_WIDGET_BASE_URL:-https://reception.clarusgrid.online}

RUN npm run build

# Caddy serves the built SPA and reverse-proxies the API domain to the api
# container - one image, automatic HTTPS, no nginx/certbot config to maintain.
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
