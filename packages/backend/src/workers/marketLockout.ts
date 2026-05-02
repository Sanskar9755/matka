/**
 * Market Lockout Worker.
 *
 * Schedules and processes BullMQ delayed jobs that lock markets at their
 * lockout time (result_time − 20 minutes).
 *
 * On server startup, call `scheduleAllMarketLockouts()` to schedule jobs
 * for all active markets. After any market create/edit, call
 * `scheduleMarketLockout(market)` to reschedule that market's job.
 */

import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';
import { createWorker, getMarketLockoutQueue, QUEUE_MARKET_LOCKOUT } from '../lib/bullmq.js';
import type { Job } from 'bullmq';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarketLockoutJobData {
  marketId: string;
  action?: 'lock' | 'close';
}

export interface MarketScheduleInput {
  id: string;
  result_time: string; // HH:MM
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a time string (HH:MM) and return a Date for today at that time (local).
 */
function getTodayAtTime(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  return target;
}

/**
 * Calculate the lockout time for a market: result_time − 20 minutes.
 */
function getLockoutTime(resultTime: string): Date {
  const resultDate = getTodayAtTime(resultTime);
  return new Date(resultDate.getTime() - 20 * 60 * 1000);
}

/**
 * Calculate milliseconds until a target Date from now.
 * Returns 0 if the target is in the past.
 */
function msUntil(target: Date): number {
  const diff = target.getTime() - Date.now();
  return Math.max(0, diff);
}

// ---------------------------------------------------------------------------
// scheduleMarketLockout
// ---------------------------------------------------------------------------

/**
 * Schedule a delayed BullMQ job to lock a market at its lockout time.
 * If the lockout time has already passed today, the job is not scheduled.
 *
 * @param market  Market object with id and result_time
 */
export async function scheduleMarketLockout(market: MarketScheduleInput): Promise<void> {
  if (!market.is_active) {
    return;
  }

  const lockoutTime = getLockoutTime(market.result_time);
  const delay = msUntil(lockoutTime);

  if (delay === 0 && lockoutTime.getTime() < Date.now()) {
    console.log(
      `[MarketLockout] Lockout time for market=${market.id} has already passed today. Skipping schedule.`,
    );
    return;
  }

  const queue = getMarketLockoutQueue();

  // Use a deterministic jobId so rescheduling replaces the existing job
  const jobId = `market-lockout:${market.id}:${lockoutTime.toISOString().slice(0, 10)}`;

  await queue.add(
    'lockout',
    { marketId: market.id },
    {
      delay,
      jobId,
    },
  );

  console.log(
    `[MarketLockout] Scheduled lockout for market=${market.id} in ${Math.round(delay / 1000)}s (at ${lockoutTime.toISOString()}).`,
  );
}

// ---------------------------------------------------------------------------
// scheduleAllMarketLockouts
// ---------------------------------------------------------------------------

/**
 * Fetch all active markets and schedule lockout jobs for each.
 * Call this on server startup.
 */
export async function scheduleAllMarketLockouts(): Promise<void> {
  const markets = await prisma.market.findMany({
    where: { is_active: true },
  });

  console.log(`[MarketLockout] Scheduling lockouts for ${markets.length} active markets.`);

  for (const market of markets) {
    await scheduleMarketLockout({
      id: market.id,
      result_time: market.result_time,
      is_active: market.is_active,
    });
  }
}

// ---------------------------------------------------------------------------
// processMarketLockout
// ---------------------------------------------------------------------------

/**
 * Core lockout logic: set market status to 'locked' and publish event.
 * After result_time passes, market becomes 'closed' for the day.
 * Exported for testability.
 */
export async function processMarketLockout(marketId: string): Promise<void> {
  const market = await prisma.market.findUnique({
    where: { id: marketId },
  });

  if (!market) {
    console.error(`[MarketLockout] Market ${marketId} not found.`);
    return;
  }

  const lockoutTime = getLockoutTime(market.result_time);
  const now = new Date();

  if (now < lockoutTime) {
    console.log(`[MarketLockout] Job fired early for market=${marketId}. Skipping.`);
    return;
  }

  // Set market status to 'locked' (betting closed)
  await prisma.market.update({
    where: { id: marketId },
    data: { status: 'locked' },
  });

  console.log(`[MarketLockout] Market ${marketId} locked at ${now.toISOString()}.`);

  // Publish market:locked event
  const channel = `market:${marketId}`;
  const payload = JSON.stringify({
    event: 'market:locked',
    marketId,
    lockedAt: now.toISOString(),
  });
  await redis.publish(channel, payload);

  // Schedule market close after result_time
  // After result is declared, market should be 'closed' for the day
  const [rh, rm] = market.result_time.split(':').map(Number);
  const resultTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), rh, rm, 0);
  const msUntilResult = Math.max(0, resultTime.getTime() - now.getTime());

  // Add a delayed job to close the market after result time
  const queue = getMarketLockoutQueue();
  await queue.add(
    'close',
    { marketId, action: 'close' },
    {
      delay: msUntilResult + 60000, // 1 min after result time
      jobId: `market-close:${marketId}:${resultTime.toISOString().slice(0, 10)}`,
    },
  );
}

// ---------------------------------------------------------------------------
// BullMQ Worker
// ---------------------------------------------------------------------------

export const marketLockoutWorker = createWorker<MarketLockoutJobData>(
  QUEUE_MARKET_LOCKOUT,
  async (job: Job<MarketLockoutJobData>) => {
    const { marketId, action } = job.data;

    if (action === 'close') {
      // Close market for the day — stays closed until midnight reset
      await prisma.market.update({
        where: { id: marketId },
        data: { status: 'closed' },
      });
      console.log(`[MarketLockout] Market ${marketId} CLOSED for today.`);

      // Publish market:closed event
      await redis.publish(`market:${marketId}`, JSON.stringify({
        event: 'market:closed',
        marketId,
        closedAt: new Date().toISOString(),
        message: 'Market closed for today. Reopens tomorrow.',
      }));
    } else {
      // Default: lock market (betting closed)
      console.log(`[MarketLockout] Processing lockout job ${job.id} for market=${marketId}`);
      await processMarketLockout(marketId);
    }
  },
);
