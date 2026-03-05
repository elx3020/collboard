//@lint-ignore-file no-console
import { createServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { getRedisSubscriber, closeRedisConnections } from './lib/redis';
import { verifyAuthToken } from './lib/auth/tokens';
import { logger } from './lib/logger';
import type { WsClientMessage } from './lib/types';

// ─── Configuration ─────────────────────────────────────────────────────────────

const WS_PORT = parseInt(process.env.WS_PORT || '3002', 10);
const HEARTBEAT_INTERVAL_MS = 30_000;

// ─── Room & Socket State ───────────────────────────────────────────────────────

interface SocketMeta {
  userId: string;
  boardId: string | null;
  alive: boolean;
}


class WebSocketWithMeta extends WebSocket { 
  __meta: SocketMeta = {} as SocketMeta;
}

/** Per-board set of connected sockets */
const rooms = new Map<string, Set<WebSocketWithMeta>>();
/** Metadata attached to each socket */
const meta = new WeakMap<WebSocketWithMeta, SocketMeta>();

// ─── Room helpers ──────────────────────────────────────────────────────────────

function joinRoom(ws: WebSocketWithMeta, boardId: string) {
  const m = meta.get(ws)!;

  // Leave previous room (if any)
  if (m.boardId) leaveRoom(ws);

  m.boardId = boardId;

  if (!rooms.has(boardId)) rooms.set(boardId, new Set());
  rooms.get(boardId)!.add(ws);

  // Broadcast presence to others in the room
  broadcastToRoom(boardId, ws, {
    type: 'user:joined',
    data: { userId: m.userId, timestamp: new Date().toISOString() },
  });

  logger.info(`User ${m.userId} joined board ${boardId}`);
}

function leaveRoom(ws: WebSocketWithMeta) {
  const m = meta.get(ws);
  if (!m?.boardId) return;

  const boardId = m.boardId;
  m.boardId = null;

  const room = rooms.get(boardId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) rooms.delete(boardId);
  }

  broadcastToRoom(boardId, null, {
    type: 'user:left',
    data: { userId: m.userId, timestamp: new Date().toISOString() },
  });

  logger.info(`User ${m.userId} left board ${boardId}`);
}

/** Send a JSON message to every socket in `boardId` except `exclude` */
function broadcastToRoom(boardId: string, exclude: WebSocket | null, msg: object) {
  const room = rooms.get(boardId);
  if (!room) return;

  const payload = JSON.stringify(msg);
  for (const client of room) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

/** Send a JSON message to a single socket */
function send(ws: WebSocket, msg: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ─── Authentication ────────────────────────────────────────────────────────────

async function authenticate(req: IncomingMessage): Promise<string | null> {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) return null;

    const result = await verifyAuthToken(token);
    return result?.userId ?? null;
  } catch {
    return null;
  }
}

// ─── HTTP + WebSocket Server ───────────────────────────────────────────────────

const httpServer = createServer((_req, res) => {
  // Simple health endpoint
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ws ok');
});

const wss = new WebSocketServer({ noServer: true, WebSocket: WebSocketWithMeta });

wss.on('connection', (ws: WebSocketWithMeta) => {
  const m = ws.__meta;
  meta.set(ws, m);

  logger.info(`User connected: ${m.userId}`);

  // Handle incoming messages
  ws.on('message', (raw) => {
    try {
      const msg: WsClientMessage = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'join:board':
          joinRoom(ws, msg.data.boardId);
          break;
        case 'leave:board':
          leaveRoom(ws);
          break;
        case 'ping':
          send(ws, { type: 'pong' });
          break;
        default:
          logger.warn({ msg }, 'Unknown message type');
      }
    } catch (err) {
      logger.error({ err }, 'Error parsing WS message');
    }
  });

  // Handle close
  ws.on('close', () => {
    leaveRoom(ws);
    logger.info(`User disconnected: ${m.userId}`);
  });

  ws.on('error', (err) => {
    logger.error({ err, userId: m.userId }, 'WebSocket error');
    leaveRoom(ws);
  });

  // Mark alive for heartbeat
  m.alive = true;
  ws.on('pong', () => {
    m.alive = true;
  });
});

// ─── Authenticate on upgrade (before 'connection' fires) ──────────────────────

httpServer.on('upgrade', async (req, socket, head) => {
  try {
    const userId = await authenticate(req);

    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      // Attach metadata before emitting 'connection'
      const m: SocketMeta = { userId, boardId: null, alive: true };
      ws.__meta = m;
      wss.emit('connection', ws, req);
    });
  } catch (err) {
    logger.error({ err }, 'Upgrade error');
    socket.destroy();
  }
});

// ─── Heartbeat: detect dead connections ────────────────────────────────────────

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    const m = meta.get(ws);
    if (!m || !m.alive) {
      ws.terminate();
      continue;
    }
    m.alive = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', () => clearInterval(heartbeat));

// ─── Redis Subscription Bridge ─────────────────────────────────────────────────

function setupRedisSubscriptions() {
  const subscriber = getRedisSubscriber();

  subscriber.psubscribe('board:*', (err, count) => {
    if (err) {
      logger.error({ err }, 'Failed to subscribe to Redis channels');
      return;
    }
    logger.info(`Subscribed to ${count} Redis channel pattern(s)`);
  });

  subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
    try {
      const event = JSON.parse(message);
      const boardId = channel.split(':')[1];

      if (!boardId) {
        logger.error({ channel }, 'Invalid channel format');
        return;
      }

      // Broadcast to all clients in the board room
      broadcastToRoom(boardId, null, { type: event.type, data: event.data });

      logger.debug(`Broadcasting ${event.type} to board ${boardId}`);
    } catch (err) {
      logger.error({ err }, 'Error processing Redis message');
    }
  });

  subscriber.on('error', (err) => {
    logger.error({ err }, 'Redis subscriber error');
  });
}

// ─── Start ─────────────────────────────────────────────────────────────────────

setupRedisSubscriptions();

httpServer.listen(WS_PORT, () => {
  logger.info(`> WebSocket server ready on port ${WS_PORT}`);
});

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────

async function shutdown() {
  logger.info('WS server shutting down...');

  clearInterval(heartbeat);

  // Close all WebSocket connections
  for (const ws of wss.clients) {
    ws.close(1001, 'Server shutting down');
  }

  wss.close(() => {
    logger.info('WebSocket server closed');
  });

  await closeRedisConnections();
  logger.info('Redis connections closed');

  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
