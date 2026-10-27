import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    strictPort: false,
    // Same-origin API calls: the session cookie stays first-party and no CORS rule is needed.
    // In deployed environments the admin site's Caddy block proxies /api/admin the same way.
    proxy: {
      '/api/admin': 'http://localhost:4000',
    },
  },
});
