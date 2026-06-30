FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite embeds these at build time, so they must be passed as build args
# (docker compose build --build-arg, or the `args:` block in docker-compose.yml).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_EXPRESS_SERVER_URL
ARG VITE_WIDGET_BASE_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_EXPRESS_SERVER_URL=$VITE_EXPRESS_SERVER_URL
ENV VITE_WIDGET_BASE_URL=$VITE_WIDGET_BASE_URL

RUN npm run build

# Caddy serves the built SPA and reverse-proxies the API domain to the api
# container - one image, automatic HTTPS, no nginx/certbot config to maintain.
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
