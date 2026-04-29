/**
 * Redis Pub/Sub helpers.
 *
 * `publish` — serialises a payload to JSON and publishes it to a Redis channel.
 * `subscribe` — subscribes to a Redis channel and calls a handler with the
 *               parsed payload on every message.
 *
 * Uses the shared `redis` client for publishing and the dedicated
 * `redisSubscriber` client for subscriptions (a connection in subscriber mode
 * cannot issue regular commands).
 *
 * Message envelope format (used by the Socket.IO bridge):
 *   { event: string, data: unknown }
 *
 * When publishing real-time events (e.g. bet:new, market:locked), callers
 * should wrap the payload in this envelope so the Socket.IO bridge can route
 * the event correctly.
 */

import redis, { redisSubscriber } from '../lib/redis.js';

/**
 * Publish a JSON payload to a Redis channel.
 * The payload is serialised as-is; callers are responsible for the envelope.
 */
export async function publish(channel: string, payload: unknown): Promise<void> {
  const message = JSON.stringify(payload);
  await redis.publish(channel, message);
}

/**
 * Subscribe to a Redis channel (exact match, not pattern).
 * The handler is called with the parsed JSON payload on every message.
 *
 * Note: uses the shared `redisSubscriber` connection. If the Socket.IO bridge
 * has already called `psubscribe` on the same connection, individual channel
 * subscriptions via `subscribe` will still work — Redis supports mixing
 * subscribe and psubscribe on the same connection.
 */
export function subscribe(channel: string, handler: (payload: unknown) => void): void {
  redisSubscriber.subscribe(channel, (err) => {
    if (err) {
      console.error(`[PubSub] Failed to subscribe to channel "${channel}":`, err.message);
    }
  });

  redisSubscriber.on('message', (receivedChannel: string, message: string) => {
    if (receivedChannel !== channel) return;
    try {
      const payload = JSON.parse(message) as unknown;
      handler(payload);
    } catch (err) {
      console.error(`[PubSub] Failed to parse message on channel "${channel}":`, err);
    }
  });
}
