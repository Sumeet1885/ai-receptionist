import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Served at /super-admin/ on the customer domain (apps/web/Caddyfile); same path locally.
  base: '/super-admin/',
  server: {
    // apps/web/dev-admin.ts mounts this app on the user's Vite server at /super-admin/.
    // It runs in middleware mode instead of opening another public port.
    middlewareMode: true,
    // Same-origin API calls: the session cookie stays first-party and no CORS rule is needed.
    // Deployed, the console is same-origin with the API through Caddy's /api/* proxy.
    proxy: {
      // ws: the realtime admin events socket at /api/admin/events.
      '/api/admin': { target: 'http://localhost:4000', ws: true },
    },
  },
});
