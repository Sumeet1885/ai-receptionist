import { WebSocketServer, type WebSocket } from 'ws';
import { config } from '../../config';
import { logger } from '../../services/cloudwatchLogger';
import { subscribeAdminEvents } from '../../services/adminEvents';
import { rejectUpgrade, type UpgradeHandler } from '../../utils/upgradeRouter';
import { resolveAdminSession } from './middleware';
import { hasRole } from './session';

const RECHECK_MS = 60_000;

/**
 * /api/admin/events: pushes admin events (new or changed access requests) to signed-in admin.
 * Browsers send cookies on WebSocket upgrades from any site, so the Origin header must be the
 * admin console, and the session is re-checked every minute so a revoked session is cut off.
 */
export function createAdminEventsServer(): UpgradeHandler {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  wss.on('connection', (socket: WebSocket, cookieHeader: string | undefined) => {
    const unsubscribe = subscribeAdminEvents((event) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    });

    const recheck = setInterval(async () => {
      try {
        const admin = await resolveAdminSession(cookieHeader);
        if (!admin || admin.adminUser.must_change_password) socket.close(4401, 'Session ended');
      } catch {
        socket.close(1011, 'Session check failed');
      }
    }, RECHECK_MS);

    socket.on('close', () => {
      clearInterval(recheck);
      unsubscribe();
    });
    // Clients only listen; anything they send is ignored.
    socket.on('message', () => undefined);
    socket.send(JSON.stringify({ type: 'ready' }));
  });

  return (req, socket, head) => {
    if (!req.headers.origin || !config.admin.origins.includes(req.headers.origin)) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }
    resolveAdminSession(req.headers.cookie)
      .then((admin) => {
        if (!admin || admin.adminUser.must_change_password || !hasRole(admin.roles, 'read_only')) {
          rejectUpgrade(socket, 401, 'Unauthorized');
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req.headers.cookie));
      })
      .catch((error) => {
        logger.error('[AdminEvents] upgrade failed', { error: error?.message });
        rejectUpgrade(socket, 500, 'Internal Server Error');
      });
  };
}
