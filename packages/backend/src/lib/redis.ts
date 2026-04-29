/**
 * Redis client singleton using ioredis.
 *
 * A single shared Redis connection is reused across the application.
 * BullMQ requires its own dedicated connections (one per queue/worker),
 * so this singleton is used only for general-purpose operations such as
 * caching, counters, and Pub/Sub publishing.
 *
 * For Pub/Sub subscriptions a separate subscriber connection is exported
 * because a connection in subscriber mode cannot issue regular commands.
 */

import Redis from 'ioredis';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

/**
 * General-purpose Redis client (commands + publishing).
 */
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ when sharing the connection
  enableReadyCheck: false,
  lazyConnect: false,
});

redis.on('error', (err: Error) => {
  console.error('[Redis] connection error:', err.message);
});

redis.on('connect', () => {
  console.info('[Redis] connected');
});

/**
 * Dedicated subscriber connection.
 * A Redis connection in subscribe mode cannot issue regular commands,
 * so we keep it separate from the main client.
 */
export const redisSubscriber = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
});

redisSubscriber.on('error', (err: Error) => {
  console.error('[Redis Subscriber] connection error:', err.message);
});

export default redis;
