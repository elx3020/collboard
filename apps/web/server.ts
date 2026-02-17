import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { setupWebSocketServer, setSocketIOInstance } from './lib/websocket';
import { closeRedisConnections } from './lib/redis';
import { logger } from './lib/logger';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    const start = Date.now();
    try {
      // Parse URL
      const parsedUrl = parse(req.url!, true);
      
      // Handle Next.js requests
      await handle(req, res, parsedUrl);
    } catch (err) {
      logger.error({ err, url: req.url }, 'Error handling request');
      res.statusCode = 500;
      res.end('Internal Server Error');
    } finally {
      const duration = Date.now() - start;
      // Only log API/page requests, skip static asset noise
      if (req.url && !req.url.startsWith('/_next/') && !req.url.startsWith('/favicon')) {
        logger.info(
          {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration,
          },
          'request'
        );
      }
    }
  });

  // Setup Socket.io server
  const io = setupWebSocketServer(httpServer);
  setSocketIOInstance(io);

  // Start server
  httpServer.listen(port, () => {
    logger.info(`> Ready on http://${hostname}:${port}`);
    logger.info('> WebSocket server ready');
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    
    // Close Socket.io connections
    io.close(() => {
      logger.info('Socket.io server closed');
    });

    // Close Redis connections
    await closeRedisConnections();
    logger.info('Redis connections closed');

    // Close HTTP server
    httpServer.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});
