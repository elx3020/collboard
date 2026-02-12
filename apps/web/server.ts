import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { setupWebSocketServer, setSocketIOInstance } from './lib/websocket';
import { closeRedisConnections } from './lib/redis';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      // Parse URL
      const parsedUrl = parse(req.url!, true);
      
      // Handle Next.js requests
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Setup Socket.io server
  const io = setupWebSocketServer(httpServer);
  setSocketIOInstance(io);

  // Start server
  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server ready`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down gracefully...');
    
    // Close Socket.io connections
    io.close(() => {
      console.log('Socket.io server closed');
    });

    // Close Redis connections
    await closeRedisConnections();
    console.log('Redis connections closed');

    // Close HTTP server
    httpServer.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});
