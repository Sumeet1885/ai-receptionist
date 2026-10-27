import { WebSocketServer, type WebSocket } from 'ws';
import { config } from '../../config';
import { logger } from '../../services/cloudwatchLogger';
import { subscribeStaffEvents } from '../../services/staffEvents';
import { rejectUpgrade, type UpgradeHandler } from '../../utils/upgradeRouter';
import { resolveStaffSession } from './middleware';
import { hasRole } from './session';

const RECHECK_MS = 60_000;

/**
 * /api/admin/events: pushes staff events (new or changed access requests) to signed-in staff.
 * Browsers send cookies on WebSocket upgrades from any site, so the Origin header must be the
 * admin console, and the session is re-checked every minute so a revoked session is cut off.
 */
export function createStaffEventsServer(): UpgradeHandler {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  wss.on('connection', (socket: WebSocket, cookieHeader: string | undefined) => {
    const unsubscribe = subscribeStaffEvents((event) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    });

    const recheck = setInterval(async () => {
      try {
        const staff = await resolveStaffSession(cookieHeader);
        if (!staff || staff.principal.must_change_password) socket.close(4401, 'Session ended');
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
    if (req.headers.origin !== config.admin.origin) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }
    resolveStaffSession(req.headers.cookie)
      .then((staff) => {
        if (!staff || staff.principal.must_change_password || !hasRole(staff.roles, 'read_only')) {
          rejectUpgrade(socket, 401, 'Unauthorized');
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req.headers.cookie));
      })
      .catch((error) => {
        logger.error('[StaffEvents] upgrade failed', { error: error?.message });
        rejectUpgrade(socket, 500, 'Internal Server Error');
      });
  };
}
