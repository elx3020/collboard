import Redis from 'ioredis';

/**
 * Redis client for pub/sub and caching
 */

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Main Redis client for pub/sub
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis Client Connected');
    });
  }

  return redisClient;
}

// Publisher for pub/sub (separate connection)
let redisPublisher: Redis | null = null;

export function getRedisPublisher(): Redis {
  if (!redisPublisher) {
    redisPublisher = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisPublisher.on('error', (err) => {
      console.error('Redis Publisher Error:', err);
    });

    redisPublisher.on('connect', () => {
      console.log('Redis Publisher Connected');
    });
  }

  return redisPublisher;
}

// Subscriber for pub/sub (separate connection)
let redisSubscriber: Redis | null = null;

export function getRedisSubscriber(): Redis {
  if (!redisSubscriber) {
    redisSubscriber = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
    });

    redisSubscriber.on('error', (err) => {
      console.error('Redis Subscriber Error:', err);
    });

    redisSubscriber.on('connect', () => {
      console.log('Redis Subscriber Connected');
    });
  }

  return redisSubscriber;
}

/**
 * Publish event to Redis channel
 */
export async function publishEvent(channel: string, event: any): Promise<void> {
  try {
    const publisher = getRedisPublisher();
    await publisher.publish(channel, JSON.stringify(event));
  } catch (error) {
    console.error('Failed to publish event:', error);
    throw error;
  }
}

/**
 * Channel names for different event types
 */
export const CHANNELS = {
  BOARD: (boardId: string) => `board:${boardId}`,
  TASK_MOVED: (boardId: string) => `board:${boardId}:task-moved`,
  COMMENT_ADDED: (boardId: string) => `board:${boardId}:comment-added`,
  USER_PRESENCE: (boardId: string) => `board:${boardId}:presence`,
};

/**
 * Event types for real-time updates
 */
export enum EventType {
  TASK_MOVED = 'task:moved',
  TASK_CREATED = 'task:created',
  TASK_UPDATED = 'task:updated',
  TASK_DELETED = 'task:deleted',
  COMMENT_ADDED = 'comment:added',
  COMMENT_UPDATED = 'comment:updated',
  COMMENT_DELETED = 'comment:deleted',
  USER_JOINED = 'user:joined',
  USER_LEFT = 'user:left',
}

/**
 * Graceful shutdown
 */
export async function closeRedisConnections(): Promise<void> {
  const promises = [];
  
  if (redisClient) {
    promises.push(redisClient.quit());
    redisClient = null;
  }
  
  if (redisPublisher) {
    promises.push(redisPublisher.quit());
    redisPublisher = null;
  }
  
  if (redisSubscriber) {
    promises.push(redisSubscriber.quit());
    redisSubscriber = null;
  }

  await Promise.all(promises);
}
