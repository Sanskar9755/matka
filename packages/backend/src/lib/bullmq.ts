/**
 * BullMQ queue and worker factory helpers.
 *
 * Centralises queue/worker creation so that every part of the application
 * uses consistent Redis connection options and queue names.
 *
 * Queue names
 * -----------
 * - 'result-polling'      Scheduled repeatable job for fetching market results
 * - 'winning-calculation' Processes a declared result and credits winning wallets
 * - 'market-lockout'      Delayed jobs that lock a market at its lockout time
 */

import { Queue, Worker, type Processor, type WorkerOptions, type QueueOptions } from 'bullmq';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

// ---------------------------------------------------------------------------
// Queue names — exported as constants to avoid magic strings
// ---------------------------------------------------------------------------

export const QUEUE_RESULT_POLLING = 'result-polling';
export const QUEUE_WINNING_CALCULATION = 'winning-calculation';
export const QUEUE_MARKET_LOCKOUT = 'market-lockout';

// ---------------------------------------------------------------------------
// Shared Redis connection options for BullMQ
// BullMQ requires maxRetriesPerRequest: null on its connections.
// ---------------------------------------------------------------------------

const redisConnection = {
  host: (() => {
    try {
      return new URL(REDIS_URL).hostname;
    } catch {
      return 'localhost';
    }
  })(),
  port: (() => {
    try {
      return parseInt(new URL(REDIS_URL).port || '6379', 10);
    } catch {
      return 6379;
    }
  })(),
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
};

// ---------------------------------------------------------------------------
// Factory: Queue
// ---------------------------------------------------------------------------

/**
 * Creates (or returns) a BullMQ Queue for the given name.
 * Callers should cache the returned instance rather than calling this
 * repeatedly, as each call creates a new connection.
 */
export function createQueue(name: string, options?: Omit<QueueOptions, 'connection'>): Queue {
  return new Queue(name, {
    ...options,
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5_000,
      },
      ...options?.defaultJobOptions,
    },
  });
}

// ---------------------------------------------------------------------------
// Factory: Worker
// ---------------------------------------------------------------------------

/**
 * Creates a BullMQ Worker for the given queue name.
 *
 * @param name      Queue name (use the QUEUE_* constants above)
 * @param processor Job processor function
 * @param options   Additional worker options (concurrency, limiter, etc.)
 */
export function createWorker<T = unknown, R = unknown>(
  name: string,
  processor: Processor<T, R>,
  options?: Omit<WorkerOptions, 'connection'>,
): Worker<T, R> {
  const worker = new Worker<T, R>(name, processor, {
    concurrency: 1,
    ...options,
    connection: redisConnection,
  });

  worker.on('failed', (job, err) => {
    console.error(`[BullMQ] Job ${job?.id ?? 'unknown'} in queue "${name}" failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error(`[BullMQ] Worker error in queue "${name}":`, err.message);
  });

  return worker;
}

// ---------------------------------------------------------------------------
// Pre-built queue singletons (lazy — created on first import)
// ---------------------------------------------------------------------------

let _resultPollingQueue: Queue | null = null;
let _winningCalculationQueue: Queue | null = null;
let _marketLockoutQueue: Queue | null = null;

export function getResultPollingQueue(): Queue {
  if (!_resultPollingQueue) {
    _resultPollingQueue = createQueue(QUEUE_RESULT_POLLING);
  }
  return _resultPollingQueue;
}

export function getWinningCalculationQueue(): Queue {
  if (!_winningCalculationQueue) {
    _winningCalculationQueue = createQueue(QUEUE_WINNING_CALCULATION);
  }
  return _winningCalculationQueue;
}

export function getMarketLockoutQueue(): Queue {
  if (!_marketLockoutQueue) {
    _marketLockoutQueue = createQueue(QUEUE_MARKET_LOCKOUT);
  }
  return _marketLockoutQueue;
}
