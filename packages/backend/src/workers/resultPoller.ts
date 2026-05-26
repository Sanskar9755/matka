/**
 * Result Poller — fetches live results from matkaapi.com every 30 seconds.
 *
 * API: POST https://www.matkaapi.com/apis/market_api.php
 * Body: { domain, api_key, domain_key, market: "all" }
 *
 * Response format:
 * { status: true, data: [{ name, result, date, open_time, close_time }] }
 *
 * Result format: "123-45-678" (open_panna-jodi-close_panna)
 */

import axios from 'axios';
import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';
import { publish } from '../realtime/pubsub.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const API_URL = 'https://www.matkaapi.com/apis/market_api.php';
const API_DOMAIN = 'shanky.life';
const API_KEY = '6a087b32f16cc';
const DOMAIN_KEY = 'db2aa7bd73719fc2e1f3861c7fc9154f';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MatkaApiResult {
  name: string;
  result: string;       // "123-45-678" or "Loading..."
  date: string;         // "18-05-2026" (DD-MM-YYYY)
  open_time: string;    // "11:40 AM"
  close_time: string;   // "12:40 PM"
  bg_yellow_status?: boolean;
}

interface MatkaApiResponse {
  status: boolean;
  message: string;
  data: MatkaApiResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse result string "123-45-678" into parts.
 * Returns null if result is not declared yet.
 */
function parseResult(result: string): {
  open_panna: string;
  jodi: string;
  close_panna: string;
  open_ank: string;
  close_ank: string;
} | null {
  if (!result || result === 'Loading...' || result.includes('Loading')) return null;

  const cleanResult = result.trim();

  // 1. Try to match the full result first: "123-45-678"
  const fullMatch = cleanResult.match(/^(\d{1,3})-(\d{2})-(\d{1,3})$/);
  if (fullMatch) {
    const [, open_panna, jodi, close_panna] = fullMatch;
    const open_ank = jodi[0];
    const close_ank = jodi[1];
    return { open_panna, jodi, close_panna, open_ank, close_ank };
  }

  // 2. Try to match open-only results: "123-4" or "123-4*" or "123-4-***" or "123-4-Loading..."
  // It has a 3-digit open panna, a dash, and a 1-digit open ank.
  const openMatch = cleanResult.match(/^(\d{1,3})-(\d)(?:[\s\S]*)$/);
  if (openMatch) {
    const [, open_panna, open_ank] = openMatch;
    return {
      open_panna,
      jodi: '',
      close_panna: '',
      open_ank,
      close_ank: '',
    };
  }

  return null;
}

/**
 * Convert DD-MM-YYYY to YYYY-MM-DD for DB storage.
 */
function parseDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split('-');
  return new Date(`${year}-${month}-${day}`);
}

/**
 * Check Redis cache to avoid duplicate processing.
 */
async function isNewResult(marketName: string, date: string, result: string): Promise<boolean> {
  const key = `result:cache:${marketName}:${date}`;
  const cached = await redis.get(key);
  if (cached === result) return false;
  await redis.set(key, result, 'EX', 86400); // 24hr TTL
  return true;
}

// ---------------------------------------------------------------------------
// Fetch from API
// ---------------------------------------------------------------------------

async function fetchResults(): Promise<MatkaApiResult[]> {
  const response = await axios.post<MatkaApiResponse>(
    API_URL,
    {
      domain: API_DOMAIN,
      api_key: API_KEY,
      domain_key: DOMAIN_KEY,
      market: 'all',
    },
    {
      timeout: 10_000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    }
  );

  if (!response.data.status || !Array.isArray(response.data.data)) {
    throw new Error(`API error: ${response.data.message}`);
  }

  return response.data.data;
}

// ---------------------------------------------------------------------------
// Save & Broadcast
// ---------------------------------------------------------------------------

async function processResult(item: MatkaApiResult): Promise<boolean> {
  const parsed = parseResult(item.result);
  if (!parsed) return false; // Not declared yet

  const isNew = await isNewResult(item.name, item.date, item.result);
  if (!isNew) return false; // Already processed

  // Find matching market in DB (case-insensitive)
  const market = await prisma.market.findFirst({
    where: {
      name: { equals: item.name, mode: 'insensitive' },
      is_active: true,
    },
  });

  if (!market) {
    // Market not in our DB — skip silently
    return false;
  }

  const cycleDate = parseDate(item.date);
  const now = new Date();

  // Upsert result cycle
  const resultCycle = await prisma.resultCycle.upsert({
    where: {
      idx_result_cycles_market_date: {
        market_id: market.id,
        cycle_date: cycleDate,
      },
    },
    create: {
      market_id: market.id,
      cycle_date: cycleDate,
      open_panna: parsed.open_panna,
      close_panna: parsed.close_panna,
      jodi: parsed.jodi,
      open_ank: parsed.open_ank,
      close_ank: parsed.close_ank,
      calculation_done: false,
      declared_at: now,
    },
    update: {
      open_panna: parsed.open_panna,
      close_panna: parsed.close_panna,
      jodi: parsed.jodi,
      open_ank: parsed.open_ank,
      close_ank: parsed.close_ank,
      declared_at: now,
      calculation_done: false,
    },
  });

  console.log(`[ResultPoller] ✅ ${market.name}: ${item.result}`);

  // Broadcast to market room
  await publish(`market:${market.id}`, {
    event: 'market:result',
    data: {
      marketId: market.id,
      market_name: market.name,
      result_cycle_id: resultCycle.id,
      ...parsed,
      declared_at: now.toISOString(),
      cycle_date: cycleDate.toISOString(),
    },
  });

  // Broadcast to global results channel
  await publish('results:new', {
    event: 'result:declared',
    data: {
      marketId: market.id,
      market_name: market.name,
      ...parsed,
      declared_at: now.toISOString(),
      cycle_date: cycleDate.toISOString(),
    },
  });

  // Trigger winning calculation
  try {
    const { enqueueWinningCalculation } = await import('./winningCalculation.js');
    await enqueueWinningCalculation(market.id, resultCycle.id);
  } catch (err) {
    console.error('[ResultPoller] Winning calc error:', err);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Poll Loop
// ---------------------------------------------------------------------------

let pollerInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

async function pollOnce(): Promise<void> {
  if (isPolling) return;
  isPolling = true;

  try {
    const results = await fetchResults();
    let newCount = 0;

    for (const item of results) {
      const isNew = await processResult(item);
      if (isNew) newCount++;
    }

    if (newCount > 0) {
      console.log(`[ResultPoller] ${newCount} new result(s) saved.`);
    }
  } catch (err) {
    console.error('[ResultPoller] Poll error:', (err as Error).message);
  } finally {
    isPolling = false;
  }
}

export function startResultPoller(): void {
  if (pollerInterval) return;
  console.log(`[ResultPoller] Starting — polling every ${POLL_INTERVAL_MS / 1000}s`);
  void pollOnce();
  pollerInterval = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
}

export function stopResultPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log('[ResultPoller] Stopped.');
  }
}

export async function triggerPollNow(): Promise<{ results_found: number }> {
  const results = await fetchResults();
  let newCount = 0;
  for (const item of results) {
    const isNew = await processResult(item);
    if (isNew) newCount++;
  }
  return { results_found: newCount };
}
