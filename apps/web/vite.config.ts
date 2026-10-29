/// <reference types="node" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { withSeoHtml } from "./src/lib/seoHtml";
import { seoBuildConfig } from "./src/lib/seo";
import { samePortAdmin } from './dev-admin';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  const seo = seoBuildConfig(mode === 'production' ? env : { ...env, VITE_INDEXABLE: 'false' });
  return {
    plugins: [
      react(),
      tailwindcss(),
      samePortAdmin(),
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
      // Admin UI is mounted by samePortAdmin; only the backend API needs a proxy.
      proxy: {
        "/api/admin": { target: "http://localhost:4000", ws: true },
      },
    },
  };
});
