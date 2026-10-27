/// <reference types="node" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    // Fail instead of moving to another port: the API trusts this exact origin (CLIENT_URL).
    strictPort: true,
    // The admin console at /super-admin (same path as production), served by the admin dev server
    // on 3001 behind this one, and its same-origin API calls. ws: live updates and hot reload.
    proxy: {
      '/super-admin': { target: 'http://127.0.0.1:3001', ws: true },
      '/api/admin': { target: 'http://localhost:4000', ws: true },
    },
  }
});
