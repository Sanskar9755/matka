/**
 * Market service.
 *
 * Handles market creation, updates, status management, and listing with
 * computed time-based status.
 *
 * Phase system:
 *   - open_result_time  = when open session result declares (open bets lock 20 min before)
 *   - result_time       = when close session result declares (full market locks 20 min before)
 *   - After result_time + 5 min → market 'closed' for the day
 *   - Midnight reset → all markets back to 'open'
 */

import prisma from '../../lib/prisma.js';
import { MarketStatus } from '@matka/types';
import type { Market } from '@matka/types';

// ---------------------------------------------------------------------------
// createMarket
// ---------------------------------------------------------------------------

export interface CreateMarketData {
  name: string;
  open_time: string;
  close_time: string;
  result_time: string;
  open_result_time?: string;
}

export interface CreateMarketResult {
  market: Market & { open_result_time: string };
}

/**
 * Create a new market.
 */
export async function createMarket(data: CreateMarketData): Promise<CreateMarketResult> {
  const market = await prisma.market.create({
    data: {
      name: data.name,
      open_time: data.open_time,
      close_time: data.close_time,
      result_time: data.result_time,
      open_result_time: data.open_result_time ?? '',
      status: MarketStatus.Open,
      is_active: true,
    },
  });

  return {
    market: {
      id: market.id,
      name: market.name,
      open_time: market.open_time,
      close_time: market.close_time,
      result_time: market.result_time,
      open_result_time: market.open_result_time,
      status: market.status as MarketStatus,
      is_active: market.is_active,
      updated_at: market.updated_at,
    },
  };
}

// ---------------------------------------------------------------------------
// updateMarket
// ---------------------------------------------------------------------------

export interface UpdateMarketData {
  name?: string;
  open_time?: string;
  close_time?: string;
  result_time?: string;
  open_result_time?: string;
}

export interface UpdateMarketResult {
  market: Market & { open_result_time: string };
}

/**
 * Update market fields.
 */
export async function updateMarket(id: string, data: UpdateMarketData): Promise<UpdateMarketResult> {
  const market = await prisma.market.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.open_time !== undefined && { open_time: data.open_time }),
      ...(data.close_time !== undefined && { close_time: data.close_time }),
      ...(data.result_time !== undefined && { result_time: data.result_time }),
      ...(data.open_result_time !== undefined && { open_result_time: data.open_result_time }),
    },
  });

  return {
    market: {
      id: market.id,
      name: market.name,
      open_time: market.open_time,
      close_time: market.close_time,
      result_time: market.result_time,
      open_result_time: market.open_result_time,
      status: market.status as MarketStatus,
      is_active: market.is_active,
      updated_at: market.updated_at,
    },
  };
}

// ---------------------------------------------------------------------------
// setMarketStatus
// ---------------------------------------------------------------------------

export interface SetMarketStatusResult {
  market: Market;
}

/**
 * Update market status.
 */
export async function setMarketStatus(id: string, status: MarketStatus): Promise<SetMarketStatusResult> {
  const market = await prisma.market.update({
    where: { id },
    data: { status },
  });

  return {
    market: {
      id: market.id,
      name: market.name,
      open_time: market.open_time,
      close_time: market.close_time,
      result_time: market.result_time,
      status: market.status as MarketStatus,
      is_active: market.is_active,
      updated_at: market.updated_at,
    },
  };
}

// ---------------------------------------------------------------------------
// listActiveMarkets
// ---------------------------------------------------------------------------

export interface MarketWithComputedStatus extends Market {
  open_result_time: string;
  computed_status: MarketStatus;
  open_session_locked: boolean;  // true = open bets no longer accepted
  close_session_locked: boolean; // true = close bets no longer accepted
  mins_until_lockout: number;
  is_open_yet: boolean;
}

export interface ListActiveMarketsResult {
  markets: MarketWithComputedStatus[];
}

/**
 * Parse time string (HH:MM) to minutes since midnight.
 */
function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 9999;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Get current time in minutes since midnight.
 */
function getCurrentTimeInMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Weekly off days for each market (0=Sunday, 6=Saturday).
 */
const WEEKLY_OFF: Record<string, number[]> = {
  'Main Bazar':         [0, 6],
  'Milan Day':          [0], 'Milan Night':        [0], 'Milan Morning':      [0],
  'Rajdhani Day':       [0], 'Rajdhani Night':     [0],
  'Time Bazar':         [0], 'Time Bazar Morning': [0],
  'Madhur Day':         [0], 'Madhur Night':       [0], 'Madhur Morning':     [0],
  'Kalyan':             [0], 'Kalyan Morning':     [0], 'Kalyan Night':       [0],
  'Sridevi':            [0], 'Sridevi Morning':    [0], 'Sridevi Night':      [0],
  'Supreme Day':        [0], 'Supreme Night':      [0],
};

function isWeeklyOff(marketName: string): boolean {
  const today = new Date().getDay();
  return (WEEKLY_OFF[marketName] ?? []).includes(today);
}

/**
 * Compute market status from DB status + weekly off + time-based logic.
 *
 * Rules:
 * - open_time + 20 min → open bets lock (open_session_locked = true)
 * - close_time - 20 min → full market locks (computed_status = locked)
 * - close_time + 5 min → market closed for the day
 * - Midnight reset → all markets back to 'open'
 */
export function computeMarketStatus(market: {
  status: string;
  result_time: string;
  close_time: string;
  open_time: string;
  name: string;
}): MarketStatus {
  if (isWeeklyOff(market.name)) return MarketStatus.Closed;
  if (market.status === MarketStatus.Closed) return MarketStatus.Closed;

  const currentMins = getCurrentTimeInMinutes();
  const closeMins = parseTimeToMinutes(market.close_time);
  const closeLockoutMins = closeMins - 20; // full lock 20 min before close_time

  // Past close_time + 5 min → closed for today
  if (currentMins > closeMins + 5) return MarketStatus.Closed;

  // Within 20 min of close_time → fully locked
  if (currentMins >= closeLockoutMins) return MarketStatus.Locked;

  if (market.status === MarketStatus.Locked) return MarketStatus.Locked;
  return MarketStatus.Open;
}

/**
 * Check if open session is locked.
 * Open bets lock 20 min BEFORE open_result_time (or open_time if open_result_time is not set).
 * Once locked, stays locked until midnight reset.
 */
export function isOpenSessionLocked(market: {
  open_session_locked: boolean;
  open_result_time: string;
  open_time: string;
}): boolean {
  if (market.open_session_locked) return true;
  const openResultTime = market.open_result_time || market.open_time;
  if (!openResultTime) return false;
  const currentMinutes = getCurrentTimeInMinutes();
  const openLockMinutes = parseTimeToMinutes(openResultTime) - 20; // 20 min before open result
  return currentMinutes >= openLockMinutes;
}

/**
 * Check if close session is locked.
 * Close bets lock 20 min BEFORE close_time.
 * Also locked if DB status is already 'locked' or 'closed'.
 */
export function isCloseSessionLocked(market: {
  status: string;
  close_time: string;
}): boolean {
  if (market.status === 'locked' || market.status === 'closed') return true;
  if (!market.close_time) return false;
  const currentMinutes = getCurrentTimeInMinutes();
  const closeLockMinutes = parseTimeToMinutes(market.close_time) - 20; // 20 min before close_time
  return currentMinutes >= closeLockMinutes;
}

/**
 * Get minutes remaining until close lockout (close_time - 20 min).
 */
export function minutesUntilLockout(close_time: string): number {
  const currentMinutes = getCurrentTimeInMinutes();
  const lockoutMinutes = parseTimeToMinutes(close_time) - 20;
  return lockoutMinutes - currentMinutes;
}

/**
 * List all active markets with computed status + phase info.
 */
export async function listActiveMarkets(): Promise<ListActiveMarketsResult> {
  const markets = await prisma.market.findMany({
    where: { is_active: true },
  });

  const marketsWithStatus: MarketWithComputedStatus[] = markets.map((market) => {
    const computed_status = computeMarketStatus({
      status: market.status,
      result_time: market.result_time,
      close_time: market.close_time,
      open_time: market.open_time,
      name: market.name,
    });

    const open_session_locked = isOpenSessionLocked({
      open_session_locked: market.open_session_locked,
      open_result_time: market.open_result_time,
      open_time: market.open_time,
    });
    const close_session_locked = isCloseSessionLocked({
      status: market.status,
      close_time: market.close_time,
    });
    const mins_until_lockout = minutesUntilLockout(market.close_time);

    return {
      id: market.id,
      name: market.name,
      open_time: market.open_time,
      close_time: market.close_time,
      result_time: market.result_time,
      open_result_time: market.open_result_time,
      status: market.status as MarketStatus,
      is_active: market.is_active,
      updated_at: market.updated_at,
      computed_status,
      open_session_locked,
      close_session_locked,
      mins_until_lockout,
      is_open_yet: true,
    };
  });

  return { markets: marketsWithStatus };
}
