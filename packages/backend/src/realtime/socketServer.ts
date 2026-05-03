/**
 * Socket.IO server.
 *
 * - Authenticates connections via JWT (Bearer token from handshake.auth.token).
 * - Manages rooms for market updates and admin dashboards.
 * - Bridges Redis Pub/Sub channels to Socket.IO rooms.
 *
 * Exported function: `initSocketServer(httpServer)` — call once from app.ts.
 */

import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { redisSubscriber } from '../lib/redis.js';
import type { JwtPayload } from '../types/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthenticatedSocketData {
  userId: string;
  role: string;
  adminId?: string;
}

// ---------------------------------------------------------------------------
// initSocketServer
// ---------------------------------------------------------------------------

/**
 * Attach a Socket.IO server to the given HTTP server.
 * Returns the Socket.IO server instance.
 */
export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // -------------------------------------------------------------------------
  // JWT authentication middleware
  // -------------------------------------------------------------------------
  io.use((socket, next) => {
    const authToken =
      (socket.handshake.auth as Record<string, string | undefined>)['token'] ??
      (socket.handshake.headers['authorization'] as string | undefined)?.replace('Bearer ', '');

    if (!authToken) {
      return next(new Error('UNAUTHORIZED'));
    }

    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      return next(new Error('JWT_SECRET not configured'));
    }

    try {
      const decoded = jwt.verify(authToken, secret) as JwtPayload;
      (socket.data as AuthenticatedSocketData) = {
        userId: decoded.userId,
        role: decoded.role as string,
        adminId: decoded.adminId,
      };
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  // -------------------------------------------------------------------------
  // Connection handler
  // -------------------------------------------------------------------------
  io.on('connection', (socket) => {
    const { userId, role, adminId } = socket.data as AuthenticatedSocketData;
    console.info(`[Socket.IO] connected: userId=${userId} role=${role}`);

    // -----------------------------------------------------------------------
    // Client → Server events
    // -----------------------------------------------------------------------

    /** User/Admin subscribes to a market room */
    socket.on('join:market', (marketId: unknown) => {
      if (typeof marketId !== 'string') return;
      void socket.join(`market:${marketId}`);
      console.info(`[Socket.IO] ${userId} joined room market:${marketId}`);
    });

    /** Unsubscribe from market room */
    socket.on('leave:market', (marketId: unknown) => {
      if (typeof marketId !== 'string') return;
      void socket.leave(`market:${marketId}`);
      console.info(`[Socket.IO] ${userId} left room market:${marketId}`);
    });

    /** Admin subscribes to their bet dashboard */
    socket.on('join:admin-dashboard', () => {
      const roomId = adminId ?? userId;
      void socket.join(`admin:${roomId}`);
      console.info(`[Socket.IO] ${userId} joined room admin:${roomId}`);
    });

    socket.on('disconnect', () => {
      console.info(`[Socket.IO] disconnected: userId=${userId}`);
    });
  });

  // -------------------------------------------------------------------------
  // Redis Pub/Sub → Socket.IO broadcast bridge
  // -------------------------------------------------------------------------
  setupPubSubBridge(io);

  return io;
}

// ---------------------------------------------------------------------------
// Pub/Sub bridge
// ---------------------------------------------------------------------------

/**
 * Use Redis pattern subscriptions to bridge all market:* and admin:* channels
 * to the corresponding Socket.IO rooms.
 *
 * Message envelope published to Redis:
 *   { event: "market:locked" | "market:result" | "bet:new" | "bet:totals", data: <payload> }
 */
function setupPubSubBridge(io: SocketIOServer): void {
  // Subscribe to market:*, admin:*, and results:* patterns
  redisSubscriber.psubscribe('market:*', 'admin:*', (err) => {
    if (err) console.error('[Socket.IO] psubscribe error:', err.message);
  });

  // Subscribe to global results channel
  redisSubscriber.subscribe('results:new', (err) => {
    if (err) console.error('[Socket.IO] subscribe results:new error:', err.message);
  });

  redisSubscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
    let envelope: { event: string; data: unknown };
    try { envelope = JSON.parse(message) as { event: string; data: unknown }; }
    catch { return; }

    const { event, data } = envelope;

    if (channel.startsWith('market:')) {
      if (['market:locked','market:result','market:closed'].includes(event)) {
        io.to(channel).emit(event, data);
      }
    } else if (channel.startsWith('admin:')) {
      if (['bet:new','bet:totals'].includes(event)) {
        io.to(channel).emit(event, data);
      }
    }
  });

  // Global results channel — broadcast to ALL connected clients
  redisSubscriber.on('message', (channel: string, message: string) => {
    if (channel !== 'results:new') return;
    let payload: { event: string; data: unknown };
    try { payload = JSON.parse(message) as { event: string; data: unknown }; }
    catch { return; }
    // Broadcast result:declared to all connected sockets
    io.emit('result:declared', payload.data);
    console.info('[Socket.IO] Broadcasted result:declared to all clients');
  });
}
