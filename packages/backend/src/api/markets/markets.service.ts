/**
 * Market service.
 *
 * Handles market creation, updates, status management, and listing with
 * computed time-based status.
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
}

export interface CreateMarketResult {
  market: Market;
}

/**
 * Create a new market.
 * Status defaults to 'open', is_active defaults to true.
 */
export async function createMarket(data: CreateMarketData): Promise<CreateMarketResult> {
  const market = await prisma.market.create({
    data: {
      name: data.name,
      open_time: data.open_time,
      close_time: data.close_time,
      result_time: data.result_time,
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
}

export interface UpdateMarketResult {
  market: Market;
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
    },
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
// setMarketStatus
// ---------------------------------------------------------------------------

export interface SetMarketStatusResult {
  market: Market;
}

/**
 * Update market status (activate/deactivate).
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
  computed_status: MarketStatus;
  mins_until_lockout: number;
  is_open_yet: boolean;        // false = not yet open time, but will open today
}

export interface ListActiveMarketsResult {
  markets: MarketWithComputedStatus[];
}

/**
 * Parse time string (HH:MM) to minutes since midnight.
 */
function parseTimeToMinutes(timeStr: string): number {
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
 * Compute market status — simple time-based logic.
 * DB 'closed' = result declared, stays closed until midnight reset.
 * DB 'locked' = admin locked or auto-locked.
 * DB 'open' = check current time against open/close window.
 */
export function computeMarketStatus(market: {
  status: string;
  result_time: string;
  close_time: string;
  open_time: string;
}): MarketStatus {
  if (market.status === MarketStatus.Closed) return MarketStatus.Closed;
  if (market.status === MarketStatus.Locked) return MarketStatus.Locked;
  return MarketStatus.Open;
}

/**
 * Get minutes remaining until lockout (negative = already locked).
 */
export function minutesUntilLockout(result_time: string): number {
  const currentMinutes = getCurrentTimeInMinutes();
  const lockoutMinutes = parseTimeToMinutes(result_time) - 15;
  return lockoutMinutes - currentMinutes;
}

/**
 * List all active markets with computed current status + timing info.
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
    });

    const mins_until_lockout = minutesUntilLockout(market.result_time);
    const is_open_yet = true; // No time restriction — always open if status is open

    return {
      id: market.id,
      name: market.name,
      open_time: market.open_time,
      close_time: market.close_time,
      result_time: market.result_time,
      status: market.status as MarketStatus,
      is_active: market.is_active,
      updated_at: market.updated_at,
      computed_status,
      mins_until_lockout,
      is_open_yet,
    };
  });

  return { markets: marketsWithStatus };
}
