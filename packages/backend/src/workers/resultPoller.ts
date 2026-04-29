/**
 * Result Poller Worker.
 *
 * BullMQ repeatable job for the 'result-polling' queue.
 * Fetches results from the external Result API for each active market,
 * upserts ResultCycle rows, and enqueues winning-calculation jobs.
 */

import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';
import { createWorker, getResultPollingQueue, QUEUE_RESULT_POLLING } from '../lib/bullmq.js';
import { enqueueWinningCalculation } from './winningCalculation.js';
import type { Job } from 'bullmq';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResultApiResponse {
  open_panna: string;
  close_panna: string;
  jodi: string;
  open_ank: string;
  close_ank: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get today's date as a Date object (midnight UTC, date only).
 */
function getTodayDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Format a date as YYYY-MM-DD for the Result API query parameter.
 */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Redis key for tracking consecutive poll failures per market.
 */
function failureCounterKey(marketId: string): string {
  return `result_poll_failures:${marketId}`;
}

const CONSECUTIVE_FAILURE_ALERT_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// pollMarketResult
// ---------------------------------------------------------------------------

/**
 * Poll the Result API for a single market and process the result.
 * Exported for testability.
 */
export async function pollMarketResult(
  marketId: string,
  marketName: string,
  resultApiEndpoint: string,
): Promise<{ upserted: boolean; enqueued: boolean }> {
  const today = getTodayDate();
  const dateStr = formatDate(today);
  const url = `${resultApiEndpoint}?market=${encodeURIComponent(marketName)}&date=${dateStr}`;

  let apiResponse: ResultApiResponse;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000), // 10-second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    apiResponse = (await response.json()) as ResultApiResponse;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `[ResultPoller] Failed to fetch result for market=${marketName} (${marketId}) on ${dateStr}: ${errorMessage}`,
    );

    // Increment failure counter in Redis
    const counterKey = failureCounterKey(marketId);
    const newCount = await redis.incr(counterKey);
    // Set TTL of 1 hour so stale counters expire
    await redis.expire(counterKey, 3600);

    if (newCount >= CONSECUTIVE_FAILURE_ALERT_THRESHOLD) {
      console.error(
        `[ResultPoller] ALERT: ${newCount} consecutive failures for market=${marketName} (${marketId}). Last error: ${errorMessage}`,
      );
    }

    return { upserted: false, enqueued: false };
  }

  // Reset failure counter on success
  await redis.del(failureCounterKey(marketId));

  // Upsert ResultCycle
  const resultCycle = await prisma.resultCycle.upsert({
    where: {
      idx_result_cycles_market_date: {
        market_id: marketId,
        cycle_date: today,
      },
    },
    create: {
      market_id: marketId,
      cycle_date: today,
      open_panna: apiResponse.open_panna,
      close_panna: apiResponse.close_panna,
      jodi: apiResponse.jodi,
      open_ank: apiResponse.open_ank,
      close_ank: apiResponse.close_ank,
      calculation_done: false,
      declared_at: new Date(),
    },
    update: {
      open_panna: apiResponse.open_panna,
      close_panna: apiResponse.close_panna,
      jodi: apiResponse.jodi,
      open_ank: apiResponse.open_ank,
      close_ank: apiResponse.close_ank,
      declared_at: new Date(),
    },
  });

  // Only enqueue winning-calculation if not already done
  if (!resultCycle.calculation_done) {
    await enqueueWinningCalculation(marketId, resultCycle.id);
    console.log(
      `[ResultPoller] Enqueued winning-calculation for market=${marketName} (${marketId}), cycle=${resultCycle.id}`,
    );
    return { upserted: true, enqueued: true };
  }

  return { upserted: true, enqueued: false };
}

// ---------------------------------------------------------------------------
// processResultPolling
// ---------------------------------------------------------------------------

/**
 * Main polling logic: fetch config, iterate active markets, poll each one.
 * Exported for testability.
 */
export async function processResultPolling(): Promise<void> {
  // Fetch PlatformConfig
  const config = await prisma.platformConfig.findFirst();
  if (!config) {
    console.error('[ResultPoller] PlatformConfig not found. Skipping poll.');
    return;
  }

  const { result_api_endpoint } = config;

  // Fetch all active markets
  const markets = await prisma.market.findMany({
    where: { is_active: true },
  });

  if (markets.length === 0) {
    console.log('[ResultPoller] No active markets found.');
    return;
  }

  console.log(`[ResultPoller] Polling results for ${markets.length} active markets.`);

  // Poll each market (sequentially to avoid hammering the API)
  for (const market of markets) {
    await pollMarketResult(market.id, market.name, result_api_endpoint);
  }
}

// ---------------------------------------------------------------------------
// BullMQ Worker
// ---------------------------------------------------------------------------

export const resultPollerWorker = createWorker<Record<string, never>>(
  QUEUE_RESULT_POLLING,
  async (_job: Job<Record<string, never>>) => {
    console.log('[ResultPoller] Running scheduled poll...');
    await processResultPolling();
  },
);

// ---------------------------------------------------------------------------
// Schedule repeatable job
// ---------------------------------------------------------------------------

/**
 * Schedule the result polling repeatable job.
 * Reads the interval from PlatformConfig (defaults to 300 seconds / 5 minutes).
 */
export async function scheduleResultPolling(): Promise<void> {
  const config = await prisma.platformConfig.findFirst();
  const intervalSec = config?.result_poll_interval_sec ?? 300;
  const intervalMs = intervalSec * 1000;

  const queue = getResultPollingQueue();

  // Remove any existing repeatable jobs first
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Add the new repeatable job
  await queue.add(
    'poll',
    {},
    {
      repeat: {
        every: intervalMs,
      },
      jobId: 'result-polling-repeatable',
    },
  );

  console.log(`[ResultPoller] Scheduled repeatable polling every ${intervalSec}s.`);
}
