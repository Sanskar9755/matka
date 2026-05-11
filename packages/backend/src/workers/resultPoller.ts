/**
 * Result Poller — scrapes DPBoss-style sites every 30 seconds.
 *
 * Flow:
 * 1. Fetch HTML from result source URL
 * 2. Parse market results using cheerio
 * 3. Compare with cached results in Redis
 * 4. If new result found → save to DB + broadcast via Socket.IO
 *
 * Anti-block measures:
 * - Random User-Agent rotation
 * - 30s polling interval (not too aggressive)
 * - Request timeout + retry with backoff
 * - Cache last result hash to avoid duplicate processing
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';
import { publish } from '../realtime/pubsub.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;

// Rotate user agents to avoid blocks
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapedResult {
  market_name: string;
  open_panna: string;
  close_panna: string;
  jodi: string;
  open_ank: string;
  close_ank: string;
  date: string; // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Scraper — fetches from result source
// ---------------------------------------------------------------------------

/**
 * Fetch HTML with retry + backoff.
 */
async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get<string>(url, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          'User-Agent': randomUA(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
        },
        responseType: 'text',
      });
      return res.data as string;
    } catch (err) {
      const isLast = attempt === retries;
      if (isLast) throw err;
      const backoff = attempt * 2000;
      console.warn(`[ResultPoller] Fetch attempt ${attempt} failed, retrying in ${backoff}ms...`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw new Error('All retries exhausted');
}

/**
 * Parse results from dpboss09.net style HTML.
 * Extracts market name + result (open_panna-jodi-close_panna).
 */
function parseResults(html: string): ScrapedResult[] {
  const $ = cheerio.load(html);
  const results: ScrapedResult[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // dpboss09.net structure: table rows with market name and result
  // Try multiple selectors for different site layouts
  const selectors = [
    'table tr',
    '.result-table tr',
    '.matka-result tr',
    'tr',
  ];

  for (const selector of selectors) {
    $(selector).each((_i, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;

      const marketName = $(cells[0]).text().trim();
      const resultText = $(cells[1]).text().trim();

      if (!marketName || !resultText) return;

      // Parse result format: "123-45-678" or "1-23-4" etc.
      const resultMatch = resultText.match(/(\d{1,3})-(\d{2})-(\d{1,3})/);
      if (!resultMatch) return;

      const [, openPanna, jodi, closePanna] = resultMatch;
      const openAnk = String(openPanna.split('').reduce((s, d) => s + parseInt(d), 0) % 10);
      const closeAnk = String(closePanna.split('').reduce((s, d) => s + parseInt(d), 0) % 10);

      results.push({
        market_name: marketName,
        open_panna: openPanna,
        close_panna: closePanna,
        jodi,
        open_ank: openAnk,
        close_ank: closeAnk,
        date: today,
      });
    });

    if (results.length > 0) break;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Process & Save Results
// ---------------------------------------------------------------------------

/**
 * Check if result is new (not already in Redis cache).
 * Cache key: result:cache:{market_name}:{date}
 */
async function isNewResult(result: ScrapedResult): Promise<boolean> {
  const key = `result:cache:${result.market_name}:${result.date}`;
  const cached = await redis.get(key);
  const hash = `${result.open_panna}-${result.jodi}-${result.close_panna}`;
  if (cached === hash) return false;
  // Cache for 24 hours
  await redis.set(key, hash, 'EX', 86400);
  return true;
}

/**
 * Save result to DB and broadcast via Socket.IO.
 */
async function saveAndBroadcast(result: ScrapedResult): Promise<void> {
  // Find matching market in DB
  const market = await prisma.market.findFirst({
    where: {
      name: { contains: result.market_name, mode: 'insensitive' },
      is_active: true,
    },
  });

  if (!market) {
    console.log(`[ResultPoller] No matching market for: ${result.market_name}`);
    return;
  }

  const cycleDate = new Date(result.date);
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
      open_panna: result.open_panna,
      close_panna: result.close_panna,
      jodi: result.jodi,
      open_ank: result.open_ank,
      close_ank: result.close_ank,
      calculation_done: false,
      declared_at: now,
    },
    update: {
      open_panna: result.open_panna,
      close_panna: result.close_panna,
      jodi: result.jodi,
      open_ank: result.open_ank,
      close_ank: result.close_ank,
      declared_at: now,
      calculation_done: false,
    },
  });

  console.log(`[ResultPoller] ✅ Result saved: ${market.name} → ${result.open_panna}-${result.jodi}-${result.close_panna}`);

  // Broadcast to market room
  await publish(`market:${market.id}`, {
    event: 'market:result',
    data: {
      marketId: market.id,
      market_name: market.name,
      result_cycle_id: resultCycle.id,
      open_panna: result.open_panna,
      close_panna: result.close_panna,
      jodi: result.jodi,
      open_ank: result.open_ank,
      close_ank: result.close_ank,
      declared_at: now.toISOString(),
      cycle_date: result.date,
    },
  });

  // Broadcast to global results channel
  await publish('results:new', {
    event: 'result:declared',
    data: {
      marketId: market.id,
      market_name: market.name,
      open_panna: result.open_panna,
      close_panna: result.close_panna,
      jodi: result.jodi,
      open_ank: result.open_ank,
      close_ank: result.close_ank,
      declared_at: now.toISOString(),
      cycle_date: result.date,
    },
  });

  // Trigger winning calculation
  try {
    const { enqueueWinningCalculation } = await import('./winningCalculation.js');
    await enqueueWinningCalculation(market.id, resultCycle.id);
  } catch (err) {
    console.error('[ResultPoller] Failed to enqueue winning calculation:', err);
  }
}

// ---------------------------------------------------------------------------
// Main Poll Loop
// ---------------------------------------------------------------------------

let pollerInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

/**
 * Single poll cycle — fetch, parse, process new results.
 */
async function pollOnce(): Promise<void> {
  if (isPolling) return; // Prevent overlapping polls
  isPolling = true;

  try {
    // Get result source URL from platform config
    const config = await prisma.platformConfig.findFirst({
      select: { result_api_endpoint: true },
    });

    const url = config?.result_api_endpoint;
    if (!url || url === 'https://example.com/results') {
      // No valid URL configured — skip silently
      return;
    }

    console.log(`[ResultPoller] Fetching results from: ${url}`);
    const html = await fetchWithRetry(url);
    const results = parseResults(html);

    if (results.length === 0) {
      console.log('[ResultPoller] No results parsed from page.');
      return;
    }

    console.log(`[ResultPoller] Parsed ${results.length} results.`);

    // Process each result
    for (const result of results) {
      const isNew = await isNewResult(result);
      if (isNew) {
        await saveAndBroadcast(result);
      }
    }
  } catch (err) {
    console.error('[ResultPoller] Poll error:', (err as Error).message);
  } finally {
    isPolling = false;
  }
}

/**
 * Start the result poller.
 * Call once on server startup.
 */
export function startResultPoller(): void {
  if (pollerInterval) return; // Already running

  console.log(`[ResultPoller] Starting — polling every ${POLL_INTERVAL_MS / 1000}s`);

  // Run immediately on start
  void pollOnce();

  // Then poll on interval
  pollerInterval = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
}

/**
 * Stop the result poller.
 */
export function stopResultPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log('[ResultPoller] Stopped.');
  }
}

/**
 * Manual trigger — poll once immediately.
 * Used by admin API endpoint.
 */
export async function triggerPollNow(): Promise<{ results_found: number }> {
  const config = await prisma.platformConfig.findFirst({
    select: { result_api_endpoint: true },
  });

  const url = config?.result_api_endpoint;
  if (!url || url === 'https://example.com/results') {
    return { results_found: 0 };
  }

  const html = await fetchWithRetry(url);
  const results = parseResults(html);
  let newCount = 0;

  for (const result of results) {
    const isNew = await isNewResult(result);
    if (isNew) {
      await saveAndBroadcast(result);
      newCount++;
    }
  }

  return { results_found: newCount };
}
