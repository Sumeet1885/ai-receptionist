import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Served at /super-admin/ on the customer domain (apps/web/Caddyfile); same path locally.
  base: '/super-admin/',
  server: {
    port: 3001,
    // Fail instead of moving to another port: the API trusts this exact origin (ADMIN_ORIGIN).
    strictPort: true,
    // Same-origin API calls: the session cookie stays first-party and no CORS rule is needed.
    // Deployed, the console is same-origin with the API through Caddy's /api/* proxy.
    proxy: {
      // ws: the realtime admin events socket at /api/admin/events.
      '/api/admin': { target: 'http://localhost:4000', ws: true },
    },
  },
});
