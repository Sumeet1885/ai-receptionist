FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite embeds these at build time. Defaults are hardcoded here so the image
# builds correctly without --build-arg.  Override with --build-arg if needed.
ARG VITE_SUPABASE_URL="https://xdwcrsydlzprtldkwqzh.supabase.co"
ARG VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_fvHLCT-vSL2xPmhEzbVBiA__qYmKzey"
ARG VITE_EXPRESS_SERVER_URL="http://15.206.125.45/api"
ARG VITE_WIDGET_BASE_URL="http://15.206.125.45/api"
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
