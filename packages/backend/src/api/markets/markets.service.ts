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
 * Compute market status based on current time.
 * 
 * Logic:
 * - If DB status is 'locked', return 'locked' (DB is authoritative)
 * - If current time >= result_time - 20 min → 'locked'
 * - If current time >= close_time → 'closed'
 * - Otherwise → 'open'
 */
function computeMarketStatus(market: { status: string; result_time: string; close_time: string }): MarketStatus {
  // DB status is authoritative for locked state
  if (market.status === MarketStatus.Locked) {
    return MarketStatus.Locked;
  }

  const currentMinutes = getCurrentTimeInMinutes();
  const resultMinutes = parseTimeToMinutes(market.result_time);
  const closeMinutes = parseTimeToMinutes(market.close_time);
  const lockoutMinutes = resultMinutes - 20;

  // Check lockout time (20 minutes before result time)
  if (currentMinutes >= lockoutMinutes) {
    return MarketStatus.Locked;
  }

  // Check close time
  if (currentMinutes >= closeMinutes) {
    return MarketStatus.Closed;
  }

  return MarketStatus.Open;
}

/**
 * List all active markets with computed current status.
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
    });

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
    };
  });

  return { markets: marketsWithStatus };
}
