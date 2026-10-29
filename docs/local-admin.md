# User app and super-admin on one port

Run `pnpm dev` from the repository root. Open:

- User app: `http://localhost:3000/`
- Super-admin: `http://localhost:3000/super-admin/`

The admin React/Vite app runs in middleware mode inside the user-facing Vite server. It has its own module graph, React refresh and styles, but no separate HTTP listener on port 3001. Admin hot reload connects through `/super-admin/hmr` on port 3000. Root `dev:admin` and the admin package's `dev` script also start this shared frontend server.

The backend remains an internal development service on port 4000. Admin API calls use `/api/admin/*` on port 3000 and are proxied to it. Session cookies remain first-party; the admin origin check continues to allow only the configured origins.

Local `ADMIN_ORIGIN` should be `http://127.0.0.1:3000,http://localhost:3000`. Deployment continues to serve the built admin app under `/super-admin/` through Caddy, with the deployed application origin configured in `ADMIN_ORIGIN`.

Start only one copy of the frontend command at a time; both apps intentionally share port 3000. Build-time SEO rendering skips the development admin middleware. Production builds still compile web and admin separately into the same web image.
