/**
 * Daily Reset Worker.
 *
 * Runs at midnight every day:
 * - Resets all market statuses to 'open' for the new day
 * - Archives old result cycles
 *
 * This ensures markets automatically reopen next day.
 */

import prisma from '../lib/prisma.js';
import { createWorker, createQueue } from '../lib/bullmq.js';
import type { Job } from 'bullmq';

export const QUEUE_DAILY_RESET = 'daily-reset';

export const dailyResetQueue = createQueue(QUEUE_DAILY_RESET, {
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

/**
 * Reset all markets to 'open' status for the new day.
 */
export async function performDailyReset(): Promise<void> {
  const now = new Date();
  console.log(`[DailyReset] Running daily reset at ${now.toISOString()}`);

  // Reset all active markets to 'open'
  const result = await prisma.market.updateMany({
    where: { is_active: true },
    data: { status: 'open' },
  });

  console.log(`[DailyReset] Reset ${result.count} markets to 'open' status.`);
}

export const dailyResetWorker = createWorker<Record<string, never>>(
  QUEUE_DAILY_RESET,
  async (_job: Job) => {
    await performDailyReset();
  },
);

/**
 * Schedule daily reset at midnight.
 * Call this on server startup.
 */
export async function scheduleDailyReset(): Promise<void> {
  // Remove existing repeatable jobs
  const repeatableJobs = await dailyResetQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await dailyResetQueue.removeRepeatableByKey(job.key);
  }

  // Schedule to run every day at midnight (00:00)
  await dailyResetQueue.add(
    'reset',
    {},
    {
      repeat: {
        pattern: '0 0 * * *', // cron: midnight every day
      },
    },
  );

  console.log('[DailyReset] Scheduled daily reset at midnight.');
}
