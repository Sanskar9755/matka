/**
 * Market Lockout Worker.
 *
 * Schedules two independent BullMQ delayed jobs per market:
 *   1. open-lock: fires at open_result_time − 20 min → sets open_session_locked = true
 *   2. close-lock: fires at close_time − 20 min → sets status = 'locked'
 *
 * Both locks reset at midnight via dailyReset.ts.
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
  action?: 'open-lock' | 'close-lock' | 'close';
}

export interface MarketScheduleInput {
  id: string;
  open_result_time: string; // HH:MM — open session locks 20 min before this
  close_time: string;       // HH:MM — close session locks 20 min before this
  result_time: string;      // HH:MM — market closes 1 min after this
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayAtTime(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
}

function getOpenLockoutTime(openResultTime: string): Date {
  return new Date(getTodayAtTime(openResultTime).getTime() - 20 * 60 * 1000);
}

function getLockoutTime(closeTime: string): Date {
  return new Date(getTodayAtTime(closeTime).getTime() - 20 * 60 * 1000);
}

function msUntil(target: Date): number {
  return Math.max(0, target.getTime() - Date.now());
}

// ---------------------------------------------------------------------------
// scheduleMarketLockout
// ---------------------------------------------------------------------------

export async function scheduleMarketLockout(market: MarketScheduleInput): Promise<void> {
  if (!market.is_active) return;

  const queue = getMarketLockoutQueue();
  const today = new Date().toISOString().slice(0, 10);

  // --- Job 1: open-lock ---
  if (market.open_result_time) {
    const openLockTime = getOpenLockoutTime(market.open_result_time);
    const openDelay = msUntil(openLockTime);

    if (openDelay > 0 || openLockTime.getTime() >= Date.now()) {
      await queue.add(
        'open-lock',
        { marketId: market.id, action: 'open-lock' },
        {
          delay: openDelay,
          jobId: `market-open-lock:${market.id}:${today}`,
        },
      );
      console.log(`[MarketLockout] Scheduled open-lock for market=${market.id} in ${Math.round(openDelay / 1000)}s`);
    } else {
      console.log(`[MarketLockout] Open-lock time already passed for market=${market.id}. Skipping.`);
    }
  }

  // --- Job 2: close-lock ---
  const closeLockTime = getLockoutTime(market.close_time);
  const closeDelay = msUntil(closeLockTime);

  if (closeDelay > 0 || closeLockTime.getTime() >= Date.now()) {
    await queue.add(
      'close-lock',
      { marketId: market.id, action: 'close-lock' },
      {
        delay: closeDelay,
        jobId: `market-close-lock:${market.id}:${today}`,
      },
    );
    console.log(`[MarketLockout] Scheduled close-lock for market=${market.id} in ${Math.round(closeDelay / 1000)}s`);
  } else {
    console.log(`[MarketLockout] Close-lock time already passed for market=${market.id}. Skipping.`);
  }
}

// ---------------------------------------------------------------------------
// scheduleAllMarketLockouts
// ---------------------------------------------------------------------------

export async function scheduleAllMarketLockouts(): Promise<void> {
  const markets = await prisma.market.findMany({
    where: { is_active: true },
    select: { id: true, open_result_time: true, close_time: true, result_time: true, is_active: true },
  });

  console.log(`[MarketLockout] Scheduling lockouts for ${markets.length} active markets.`);

  for (const market of markets) {
    await scheduleMarketLockout({
      id: market.id,
      open_result_time: market.open_result_time,
      close_time: market.close_time,
      result_time: market.result_time,
      is_active: market.is_active,
    });
  }
}

// ---------------------------------------------------------------------------
// processOpenSessionLock
// ---------------------------------------------------------------------------

export async function processOpenSessionLock(marketId: string): Promise<void> {
  const market = await prisma.market.findUnique({ where: { id: marketId } });

  if (!market) {
    console.error(`[MarketLockout] Market ${marketId} not found.`);
    return;
  }

  const openLockTime = getOpenLockoutTime(market.open_result_time);
  const now = new Date();

  if (now < openLockTime) {
    console.log(`[MarketLockout] Open-lock job fired early for market=${marketId}. Skipping.`);
    return;
  }

  await prisma.market.update({
    where: { id: marketId },
    data: { open_session_locked: true },
  });

  console.log(`[MarketLockout] Market ${marketId} open session LOCKED at ${now.toISOString()}.`);

  await redis.publish(`market:${marketId}`, JSON.stringify({
    event: 'market:open-locked',
    marketId,
    lockedAt: now.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// processCloseSessionLock (was: processMarketLockout)
// ---------------------------------------------------------------------------

export async function processCloseSessionLock(marketId: string): Promise<void> {
  const market = await prisma.market.findUnique({ where: { id: marketId } });

  if (!market) {
    console.error(`[MarketLockout] Market ${marketId} not found.`);
    return;
  }

  // FIX: use close_time (not result_time) for the guard
  const closeLockTime = getLockoutTime(market.close_time);
  const now = new Date();

  if (now < closeLockTime) {
    console.log(`[MarketLockout] Close-lock job fired early for market=${marketId}. Skipping.`);
    return;
  }

  await prisma.market.update({
    where: { id: marketId },
    data: { status: 'locked' },
  });

  console.log(`[MarketLockout] Market ${marketId} close session LOCKED at ${now.toISOString()}.`);

  await redis.publish(`market:${marketId}`, JSON.stringify({
    event: 'market:locked',
    marketId,
    lockedAt: now.toISOString(),
  }));

  // Schedule market close after result_time + 1 min
  const [rh, rm] = market.result_time.split(':').map(Number);
  const resultTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), rh, rm, 0);
  const msUntilResult = Math.max(0, resultTime.getTime() - now.getTime());

  const queue = getMarketLockoutQueue();
  await queue.add(
    'close',
    { marketId, action: 'close' },
    {
      delay: msUntilResult + 60000,
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

    if (action === 'open-lock') {
      console.log(`[MarketLockout] Processing open-lock job ${job.id} for market=${marketId}`);
      await processOpenSessionLock(marketId);
    } else if (action === 'close-lock') {
      console.log(`[MarketLockout] Processing close-lock job ${job.id} for market=${marketId}`);
      await processCloseSessionLock(marketId);
    } else if (action === 'close') {
      await prisma.market.update({
        where: { id: marketId },
        data: { status: 'closed' },
      });
      console.log(`[MarketLockout] Market ${marketId} CLOSED for today.`);
      await redis.publish(`market:${marketId}`, JSON.stringify({
        event: 'market:closed',
        marketId,
        closedAt: new Date().toISOString(),
        message: 'Market closed for today. Reopens tomorrow.',
      }));
    } else {
      // Legacy fallback for old 'lockout' jobs still in queue
      console.log(`[MarketLockout] Processing legacy lockout job ${job.id} for market=${marketId}`);
      await processCloseSessionLock(marketId);
    }
  },
);
