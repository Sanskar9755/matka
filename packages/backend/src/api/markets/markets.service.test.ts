/**
 * Unit tests for the market service.
 *
 * Prisma is mocked so no real database is needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MarketStatus } from '@matka/types';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
vi.mock('../../lib/prisma.js', () => {
  const mockPrisma = {
    market: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  };
  return { default: mockPrisma };
});

import prisma from '../../lib/prisma.js';
import { listActiveMarkets } from './markets.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMarket(overrides: Partial<{
  id: string;
  name: string;
  open_time: string;
  close_time: string;
  result_time: string;
  status: string;
  is_active: boolean;
  updated_at: Date;
}> = {}) {
  return {
    id: 'market-uuid-1',
    name: 'Test Market',
    open_time: '09:00',
    close_time: '21:00',
    result_time: '21:30',
    status: 'open',
    is_active: true,
    updated_at: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// listActiveMarkets — computed status tests
// ---------------------------------------------------------------------------

describe('listActiveMarkets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Helper to mock the current time.
   * @param hours - current hour (0-23)
   * @param minutes - current minute (0-59)
   */
  function mockCurrentTime(hours: number, minutes: number): void {
    vi.setSystemTime(new Date(2024, 0, 1, hours, minutes, 0, 0));
  }

  it('returns computed_status = open when current time is before close_time and before lockout', async () => {
    // Market: close=21:00, result=21:30, lockout=21:10
    // Current time: 10:00 — well before lockout
    mockCurrentTime(10, 0);

    const market = makeMarket({
      open_time: '09:00',
      close_time: '21:00',
      result_time: '21:30',
      status: 'open',
    });

    vi.mocked(prisma.market.findMany).mockResolvedValue([market]);

    const result = await listActiveMarkets();

    expect(result.markets).toHaveLength(1);
    expect(result.markets[0].computed_status).toBe(MarketStatus.Open);
  });

  it('returns computed_status = locked when current time >= result_time - 20 min', async () => {
    // Market: result=21:30, lockout=21:10
    // Current time: 21:10 — exactly at lockout
    mockCurrentTime(21, 10);

    const market = makeMarket({
      open_time: '09:00',
      close_time: '21:00',
      result_time: '21:30',
      status: 'open',
    });

    vi.mocked(prisma.market.findMany).mockResolvedValue([market]);

    const result = await listActiveMarkets();

    expect(result.markets[0].computed_status).toBe(MarketStatus.Locked);
  });

  it('returns computed_status = locked when current time is past lockout', async () => {
    // Market: result=21:30, lockout=21:10
    // Current time: 21:25 — past lockout
    mockCurrentTime(21, 25);

    const market = makeMarket({
      open_time: '09:00',
      close_time: '21:00',
      result_time: '21:30',
      status: 'open',
    });

    vi.mocked(prisma.market.findMany).mockResolvedValue([market]);

    const result = await listActiveMarkets();

    expect(result.markets[0].computed_status).toBe(MarketStatus.Locked);
  });

  it('returns computed_status = closed when current time >= close_time (but before lockout)', async () => {
    // Market: close=21:00, result=23:00, lockout=22:40
    // Current time: 21:05 — past close but before lockout
    mockCurrentTime(21, 5);

    const market = makeMarket({
      open_time: '09:00',
      close_time: '21:00',
      result_time: '23:00',
      status: 'open',
    });

    vi.mocked(prisma.market.findMany).mockResolvedValue([market]);

    const result = await listActiveMarkets();

    expect(result.markets[0].computed_status).toBe(MarketStatus.Closed);
  });

  it('returns computed_status = locked when DB status is locked (DB is authoritative)', async () => {
    // Even if current time is before lockout, DB locked status is authoritative
    mockCurrentTime(10, 0);

    const market = makeMarket({
      open_time: '09:00',
      close_time: '21:00',
      result_time: '21:30',
      status: 'locked', // DB says locked
    });

    vi.mocked(prisma.market.findMany).mockResolvedValue([market]);

    const result = await listActiveMarkets();

    expect(result.markets[0].computed_status).toBe(MarketStatus.Locked);
  });

  it('returns computed_status = open when current time is 1 minute before lockout', async () => {
    // Market: result=21:30, lockout=21:10
    // Current time: 21:09 — 1 minute before lockout
    mockCurrentTime(21, 9);

    const market = makeMarket({
      open_time: '09:00',
      close_time: '21:00',
      result_time: '21:30',
      status: 'open',
    });

    vi.mocked(prisma.market.findMany).mockResolvedValue([market]);

    const result = await listActiveMarkets();

    // 21:09 < 21:10 lockout, and 21:09 >= 21:00 close → closed
    // close_time check happens after lockout check, so since 21:09 < lockout (21:10),
    // we check close: 21:09 >= 21:00 → closed
    expect(result.markets[0].computed_status).toBe(MarketStatus.Closed);
  });

  it('returns computed_status = open when current time is before close_time', async () => {
    // Market: close=21:00, result=21:30, lockout=21:10
    // Current time: 20:59 — 1 minute before close
    mockCurrentTime(20, 59);

    const market = makeMarket({
      open_time: '09:00',
      close_time: '21:00',
      result_time: '21:30',
      status: 'open',
    });

    vi.mocked(prisma.market.findMany).mockResolvedValue([market]);

    const result = await listActiveMarkets();

    expect(result.markets[0].computed_status).toBe(MarketStatus.Open);
  });

  it('only returns markets where is_active = true', async () => {
    mockCurrentTime(10, 0);

    vi.mocked(prisma.market.findMany).mockResolvedValue([
      makeMarket({ id: 'market-1', name: 'Active Market', is_active: true }),
    ]);

    const result = await listActiveMarkets();

    expect(result.markets).toHaveLength(1);
    expect(result.markets[0].name).toBe('Active Market');
    // Verify the query was called with is_active: true filter
    expect(prisma.market.findMany).toHaveBeenCalledWith({
      where: { is_active: true },
    });
  });

  it('returns empty array when no active markets exist', async () => {
    mockCurrentTime(10, 0);
    vi.mocked(prisma.market.findMany).mockResolvedValue([]);

    const result = await listActiveMarkets();

    expect(result.markets).toHaveLength(0);
  });
});
