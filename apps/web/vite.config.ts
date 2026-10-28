/// <reference types="node" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { withSeoHtml } from "./src/lib/seoHtml";
import { seoBuildConfig } from "./src/lib/seo";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  const seo = seoBuildConfig(mode === 'production' ? env : { ...env, VITE_INDEXABLE: 'false' });
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "public-page-seo",
        transformIndexHtml(html, context) {
          return withSeoHtml(html, context.path.split("?")[0], {
            origin: seo.origin,
            indexable: mode === "production" && seo.indexable,
          });
        },
      },
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 3000,
      // Fail instead of moving to another port: the API trusts this exact origin (CLIENT_URL).
      strictPort: true,
      // The admin console at /super-admin (same path as production), served by the admin dev server
      // on 3001 behind this one, and its same-origin API calls. ws: live updates and hot reload.
      proxy: {
        "/super-admin": { target: "http://127.0.0.1:3001", ws: true },
        "/api/admin": { target: "http://localhost:4000", ws: true },
      },
    },
  };
});
