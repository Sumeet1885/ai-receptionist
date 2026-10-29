import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocketServer } from 'ws';

export type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void;

// Several `ws` servers cannot each attach to the HTTP server with `{ server, path }`: every one of
// them answers 400 to upgrades for the other paths. One router dispatches by exact pathname instead.
export function routeUpgrades(server: Server, handlers: Record<string, UpgradeHandler>) {
  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const handler = handlers[pathname];
    if (!handler) {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }
    handler(req, socket, head);
  });
}

export function acceptUpgrade(wss: WebSocketServer): UpgradeHandler {
  return (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  };
}

export function rejectUpgrade(socket: Duplex, status: number, reason: string) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}
