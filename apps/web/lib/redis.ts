import Redis from 'ioredis';

// Re-export EventType and CHANNELS from the shared types module
// so existing API-route imports (`from '@/lib/redis'`) keep working.
export { EventType, CHANNELS } from './types';

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
export async function publishEvent(channel: string, event: Record<string, unknown>): Promise<void> {
  try {
    const publisher = getRedisPublisher();
    await publisher.publish(channel, JSON.stringify(event));
  } catch (error) {
    console.error('Failed to publish event:', error);
    throw error;
  }
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
