# WebSocket Real-time Features

This document describes the WebSocket integration for real-time collaborative features in Collboard.

## Architecture

The real-time system uses:
- **Socket.io** for WebSocket connections
- **Redis Pub/Sub** for scalable message broadcasting across multiple server instances
- **JWT authentication** for secure WebSocket connections

## Components

### Server-side

1. **`lib/redis.ts`** - Redis client for pub/sub messaging
   - Manages Redis connections (client, publisher, subscriber)
   - Provides `publishEvent()` function to broadcast events
   - Defines event types and channel naming conventions

2. **`lib/websocket.ts`** - Socket.io server setup
   - Handles WebSocket authentication via JWT
   - Manages room-based communication (one room per board)
   - Subscribes to Redis channels and broadcasts to Socket.io rooms
   - Implements user presence tracking (join/leave events)

3. **`server.ts`** - Custom Next.js server
   - Integrates Socket.io with Next.js
   - Handles graceful shutdown

### Client-side

1. **`lib/websocket-provider.tsx`** - React context provider for WebSocket
   - Manages Socket.io client connection
   - Handles authentication with NextAuth session tokens
   - Provides connection status and board join/leave methods

2. **`lib/hooks/use-board-realtime.tsx`** - React hook for board events
   - Subscribes to real-time board events
   - Provides typed callbacks for different event types
   - Automatically joins/leaves board rooms

## Usage

### API Routes

To emit real-time events from API routes, use the `publishEvent` function:

```typescript
import { publishEvent, CHANNELS, EventType } from '@/lib/redis';

// In your API route handler
await publishEvent(CHANNELS.BOARD(boardId), {
  type: EventType.TASK_MOVED,
  data: {
    task: updatedTask,
    oldColumnId,
    newColumnId: columnId,
    userId,
    timestamp: new Date().toISOString(),
  },
});
```

### React Components

Use the `useBoardRealtime` hook in your board components:

```typescript
'use client';

import { useBoardRealtime } from '@/lib/hooks/use-board-realtime';

export default function BoardPage({ boardId }: { boardId: string }) {
  useBoardRealtime(boardId, {
    onTaskMoved: (event) => {
      console.log('Task moved:', event);
      // Update your local state to reflect the change
    },
    onCommentAdded: (event) => {
      console.log('Comment added:', event);
      // Update your local state to show the new comment
    },
    onUserJoined: (event) => {
      console.log('User joined:', event);
      // Show a notification or update presence indicator
    },
    onUserLeft: (event) => {
      console.log('User left:', event);
      // Update presence indicator
    },
  });

  return (
    <div>
      {/* Your board UI */}
    </div>
  );
}
```

### Connection Status

Display connection status using the `ConnectionStatus` component:

```typescript
import { ConnectionStatus } from '@/lib/hooks/use-board-realtime';

export default function BoardHeader() {
  return (
    <header>
      <h1>My Board</h1>
      <ConnectionStatus />
    </header>
  );
}
```

## Event Types

The following real-time events are supported:

### Task Events
- `task:moved` - Task moved to different column or reordered
- `task:created` - New task created
- `task:updated` - Task details updated
- `task:deleted` - Task deleted

### Comment Events
- `comment:added` - New comment added to task
- `comment:updated` - Comment edited
- `comment:deleted` - Comment removed

### Presence Events
- `user:joined` - User joined the board
- `user:left` - User left the board or disconnected

## Optimistic UI Updates

For better user experience, implement optimistic updates:

1. Update UI immediately when user performs an action
2. Send API request in the background
3. If API request fails, revert the UI change
4. Real-time events from other users will update the UI automatically

Example:

```typescript
async function moveTask(taskId: string, columnId: string, order: number) {
  // 1. Optimistic update
  setTasks(prev => /* update local state */);

  try {
    // 2. Send API request
    await fetch(`/api/boards/${boardId}/tasks/${taskId}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ columnId, order }),
    });
  } catch (error) {
    // 3. Revert on error
    setTasks(prev => /* revert to previous state */);
    console.error('Failed to move task:', error);
  }
}
```

## Running the Server

The custom server with WebSocket support is used in both development and production:

```bash
# Development
npm run dev

# Production
npm run build
npm run start
```

## Environment Variables

Required environment variables:

```env
# Redis connection
REDIS_URL="redis://localhost:6379"

# NextAuth (for JWT authentication)
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# Database
DATABASE_URL="postgresql://..."
```

## Testing

Start the required services:

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Run the app
npm run dev
```

Open multiple browser windows to test real-time synchronization:
1. Sign in on both windows
2. Open the same board
3. Make changes on one window
4. Verify changes appear on the other window in real-time

## Security

- WebSocket connections require valid JWT authentication
- Users can only join boards they have access to
- All events are validated server-side before broadcasting
- Redis channels are scoped per board to prevent cross-board leaks

## Scalability

The Redis pub/sub architecture allows horizontal scaling:
- Multiple server instances can run simultaneously
- Each server subscribes to Redis channels
- Events published by any server are received by all servers
- All connected clients receive the updates regardless of which server they're connected to

## Troubleshooting

### Connection Issues

If WebSocket connection fails:
1. Check browser console for error messages
2. Verify NEXTAUTH_SECRET is set correctly
3. Ensure Redis is running (`docker ps`)
4. Check server logs for authentication errors

### Events Not Received

If real-time events aren't working:
1. Verify you're calling `joinBoard(boardId)` or using `useBoardRealtime` hook
2. Check Redis connection status in server logs
3. Ensure API routes are calling `publishEvent()`
4. Verify event type matches what you're listening for

### Performance

For optimal performance:
- Use connection status to show offline state
- Implement debouncing for frequent events
- Consider batching multiple updates
- Monitor Redis memory usage in production
