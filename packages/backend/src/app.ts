/**
 * Express application setup.
 *
 * Configures middleware, health check endpoint, API routes (stubbed for
 * subsequent tasks), and the global error handler.
 */

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import authRouter from './api/auth/auth.router.js';
import marketsRouter from './api/markets/markets.router.js';
import walletRouter from './api/wallet/wallet.router.js';
import betsRouter from './api/bets/bets.router.js';
import adminRouter from './api/admin/admin.router.js';
import superadminRouter from './api/superadmin/superadmin.router.js';
import userRouter from './api/user/user.router.js';
import notificationsRouter from './api/user/notifications.router.js';
import resultsRouter from './api/results/results.router.js';
import { initSocketServer } from './realtime/socketServer.js';

// ---------------------------------------------------------------------------
// Global BigInt JSON serialization fix
// BigInt cannot be serialized by JSON.stringify by default.
// This patch converts BigInt to Number for all JSON responses.
// ---------------------------------------------------------------------------
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

const app = express();
const httpServer = createServer(app);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public endpoint — game rates (no auth required)
app.get('/api/public/rates', async (_req, res) => {
  try {
    const prismaModule = await import('./lib/prisma.js');
    const config = await prismaModule.default.platformConfig.findFirst({
      select: { winning_multipliers: true },
    });
    res.json({ data: { winning_multipliers: config?.winning_multipliers ?? {} } });
  } catch {
    res.json({ data: { winning_multipliers: {} } });
  }
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use('/api/auth', authRouter);
app.use('/api/markets', marketsRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/bets', betsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/superadmin', superadminRouter);
app.use('/api/user', userRouter);
app.use('/api/user', notificationsRouter);
app.use('/api/results', resultsRouter);

// ---------------------------------------------------------------------------
// Global error handler — must be registered AFTER all routes
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Initialize Socket.IO server
// ---------------------------------------------------------------------------
initSocketServer(httpServer);

// ---------------------------------------------------------------------------
// Start server (only when run directly, not during tests)
// ---------------------------------------------------------------------------
if (process.env['NODE_ENV'] !== 'test') {
  // Import env lazily so tests can run without all env vars set
  const { env } = await import('./lib/env.js');
  httpServer.listen(env.PORT, async () => {
    console.log(`Matka backend listening on port ${env.PORT}`);

    // Start result poller (scrapes external site for live results)
    try {
      const { startResultPoller } = await import('./workers/resultPoller.js');
      startResultPoller();
    } catch (err) {
      console.error('[ResultPoller] Failed to start:', err);
    }

    // Schedule daily reset at midnight — resets all markets to 'open' for next day
    try {
      const { scheduleDailyReset } = await import('./workers/dailyReset.js');
      await scheduleDailyReset();
    } catch (err) {
      console.error('[DailyReset] Failed to schedule:', err);
    }

    // Schedule market lockout jobs for today + start lockout worker
    try {
      const { scheduleAllMarketLockouts, marketLockoutWorker } = await import('./workers/marketLockout.js');
      await scheduleAllMarketLockouts();
      console.log('[MarketLockout] Worker started, lockouts scheduled.');
      // Keep reference so worker stays alive
      void marketLockoutWorker;
    } catch (err) {
      console.error('[MarketLockout] Failed to schedule:', err);
    }

    // Start winning calculation worker
    try {
      const { winningCalculationWorker } = await import('./workers/winningCalculation.js');
      console.log('[WinningCalculation] Worker started.');
      void winningCalculationWorker;
    } catch (err) {
      console.error('[WinningCalculation] Failed to start worker:', err);
    }
  });
}

export default app;
