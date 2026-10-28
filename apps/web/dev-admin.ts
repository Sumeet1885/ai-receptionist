import { createServer, type Plugin } from 'vite';
import { resolve } from 'node:path';

/** Run the separate admin app inside the customer's dev server, with no extra listening port. */
export function samePortAdmin(): Plugin {
  return {
    name: 'same-port-admin',
    apply: 'serve',
    async configureServer(server) {
      if (!server.httpServer) return; // Build-time SSR uses middleware mode and needs no admin server.
      const admin = await createServer({
        root: resolve(import.meta.dirname, '../admin'),
        configFile: resolve(import.meta.dirname, '../admin/vite.config.ts'),
        appType: 'spa',
        server: {
          middlewareMode: true,
          hmr: { server: server.httpServer, clientPort: server.config.server.port, path: '/hmr' },
        },
      });
      server.httpServer?.once('close', () => { void admin.close(); });
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0] || '';
        if (pathname === '/super-admin' || pathname.startsWith('/super-admin/')) admin.middlewares(req, res, next);
        else next();
      });
    },
  };
}
