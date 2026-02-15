import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { getRedisSubscriber } from './redis';
import { verifyAuthToken } from './auth/tokens';

/**
 * Setup Socket.io server with Redis pub/sub integration
 */
export function setupWebSocketServer(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Verify JWT token
      const decoded = await verifyAuthToken(token);
      
      if (!decoded || !decoded.userId) {
        return next(new Error('Invalid token'));
      }

      // Attach user info to socket
      socket.data.userId = decoded.userId;
      
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    console.log(`User connected: ${userId} (socket: ${socket.id})`);

    // Join board room
    socket.on('join:board', async (boardId: string) => {
      try {
        // TODO: Verify user has access to this board
        socket.join(`board:${boardId}`);
        socket.data.boardId = boardId;
        
        // Notify others that user joined
        socket.to(`board:${boardId}`).emit('user:joined', {
          userId,
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });

        console.log(`User ${userId} joined board ${boardId}`);
      } catch (error) {
        console.error('Error joining board:', error);
        socket.emit('error', { message: 'Failed to join board' });
      }
    });

    // Leave board room
    socket.on('leave:board', (boardId: string) => {
      socket.leave(`board:${boardId}`);
      
      // Notify others that user left
      socket.to(`board:${boardId}`).emit('user:left', {
        userId,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      console.log(`User ${userId} left board ${boardId}`);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const boardId = socket.data.boardId as string | undefined;
      
      if (boardId) {
        socket.to(`board:${boardId}`).emit('user:left', {
          userId,
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });
      }

      console.log(`User disconnected: ${userId} (socket: ${socket.id})`);
    });

    // Heartbeat/ping-pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  // Subscribe to Redis channels and broadcast to Socket.io rooms
  setupRedisSubscriptions(io);

  return io;
}

/**
 * Setup Redis subscriptions to forward events to Socket.io
 */
function setupRedisSubscriptions(io: SocketIOServer): void {
  const subscriber = getRedisSubscriber();

  // Subscribe to board event pattern (board:*)
  subscriber.psubscribe('board:*', (err, count) => {
    if (err) {
      console.error('Failed to subscribe to Redis channels:', err);
      return;
    }
    console.log(`Subscribed to ${count} Redis channel patterns`);
  });

  // Handle incoming messages from Redis
  subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
    try {
      const event = JSON.parse(message);
      
      // Extract boardId from channel (format: board:{boardId} or board:{boardId}:*)
      const boardId = channel.split(':')[1];
      
      if (!boardId) {
        console.error('Invalid channel format:', channel);
        return;
      }

      // Broadcast to all clients in the board room
      io.to(`board:${boardId}`).emit(event.type, event.data);
      
      console.log(`Broadcasting event ${event.type} to board ${boardId}`);
    } catch (error) {
      console.error('Error processing Redis message:', error);
    }
  });

  subscriber.on('error', (err) => {
    console.error('Redis subscriber error:', err);
  });
}

/**
 * Get Socket.io instance (for emitting events from API routes)
 */
let ioInstance: SocketIOServer | null = null;

export function setSocketIOInstance(io: SocketIOServer): void {
  ioInstance = io;
}

export function getSocketIOInstance(): SocketIOServer | null {
  return ioInstance;
}
