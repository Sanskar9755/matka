/**
 * Unit tests for marketLockout.ts (fixed version)
 *
 * Tests the dual-session lock scheduling and processing logic.
 * Prisma and Redis are mocked — no real DB or Redis needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — factories must be self-contained (no top-level vars in factory)
// ---------------------------------------------------------------------------

vi.mock('../lib/bullmq.js', () => {
  const mockAdd = vi.fn().mockResolvedValue({ id: 'mock-job-id' });
  return {
    getMarketLockoutQueue: () => ({ add: mockAdd }),
    QUEUE_MARKET_LOCKOUT: 'market-lockout',
    createWorker: vi.fn(),
  };
});

vi.mock('../lib/prisma.js', () => ({
  default: {
    market: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../lib/redis.js', () => ({
  default: {
    publish: vi.fn().mockResolvedValue(1),
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  scheduleMarketLockout,
  processOpenSessionLock,
  processCloseSessionLock,
} from './marketLockout.js';
import { getMarketLockoutQueue } from '../lib/bullmq.js';
import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';

// ---------------------------------------------------------------------------
// Global Setup - Fake Timers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  // Set system time to 12:00 PM (noon) to avoid midnight date rollovers in pastTime/futureTime helpers
  vi.setSystemTime(new Date(2024, 0, 1, 12, 0, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function futureTime(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function pastTime(hoursAgo: number): string {
  const d = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function makeMarketInput(overrides: Partial<{
  id: string;
  open_result_time: string;
  close_time: string;
  result_time: string;
  is_active: boolean;
}> = {}) {
  return {
    id: 'market-001',
    open_result_time: futureTime(2),
    close_time: futureTime(4),
    result_time: futureTime(4),
    is_active: true,
    ...overrides,
  };
}

function makeDbMarket(overrides: Partial<{
  id: string;
  open_result_time: string;
  close_time: string;
  result_time: string;
  status: string;
  open_session_locked: boolean;
  is_active: boolean;
  name: string;
  open_time: string;
  updated_at: Date;
}> = {}) {
  return {
    id: 'market-001',
    name: 'Test Market',
    open_time: '09:00',
    open_result_time: pastTime(0.5),
    close_time: pastTime(0.17),
    result_time: futureTime(0.5),
    status: 'open',
    open_session_locked: false,
    is_active: true,
    updated_at: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// scheduleMarketLockout tests
// ---------------------------------------------------------------------------

describe('scheduleMarketLockout', () => {
  let mockAdd: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAdd = (getMarketLockoutQueue() as { add: ReturnType<typeof vi.fn> }).add;
    mockAdd.mockClear();
  });

  // 7.2
  it('schedules exactly 2 jobs when both lock times are in the future', async () => {
    await scheduleMarketLockout(makeMarketInput());
    expect(mockAdd).toHaveBeenCalledTimes(2);
  });

  // 7.8
  it('open-lock job ID format is market-open-lock:<id>:<date>', async () => {
    await scheduleMarketLockout(makeMarketInput({ id: 'mkt-abc' }));
    const today = new Date().toISOString().slice(0, 10);
    const openLockCall = mockAdd.mock.calls.find(
      (call: unknown[]) => (call[2] as { jobId: string }).jobId?.startsWith('market-open-lock:mkt-abc:'),
    );
    expect(openLockCall).toBeDefined();
    expect((openLockCall![2] as { jobId: string }).jobId).toBe(`market-open-lock:mkt-abc:${today}`);
  });

  // 7.9
  it('close-lock job ID format is market-close-lock:<id>:<date>', async () => {
    await scheduleMarketLockout(makeMarketInput({ id: 'mkt-xyz' }));
    const today = new Date().toISOString().slice(0, 10);
    const closeLockCall = mockAdd.mock.calls.find(
      (call: unknown[]) => (call[2] as { jobId: string }).jobId?.startsWith('market-close-lock:mkt-xyz:'),
    );
    expect(closeLockCall).toBeDefined();
    expect((closeLockCall![2] as { jobId: string }).jobId).toBe(`market-close-lock:mkt-xyz:${today}`);
  });

  // 7.3
  it('skips open-lock job if open_result_time − 20 min has already passed', async () => {
    const market = makeMarketInput({
      open_result_time: pastTime(0.5),  // 30 min ago → open-lock was 50 min ago
      close_time: futureTime(4),
    });
    await scheduleMarketLockout(market);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const call = mockAdd.mock.calls[0];
    expect((call[2] as { jobId: string }).jobId).toContain('market-close-lock:');
  });

  // 7.4
  it('skips close-lock job if close_time − 20 min has already passed', async () => {
    const market = makeMarketInput({
      open_result_time: futureTime(2),
      close_time: pastTime(0.17),  // 10 min ago → close-lock was 30 min ago
    });
    await scheduleMarketLockout(market);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const call = mockAdd.mock.calls[0];
    expect((call[2] as { jobId: string }).jobId).toContain('market-open-lock:');
  });

  it('skips all jobs when market is_active = false', async () => {
    await scheduleMarketLockout(makeMarketInput({ is_active: false }));
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('schedules open-lock job with action="open-lock"', async () => {
    await scheduleMarketLockout(makeMarketInput());
    const openLockCall = mockAdd.mock.calls.find(
      (call: unknown[]) => (call[1] as { action: string }).action === 'open-lock',
    );
    expect(openLockCall).toBeDefined();
  });

  it('schedules close-lock job with action="close-lock"', async () => {
    await scheduleMarketLockout(makeMarketInput());
    const closeLockCall = mockAdd.mock.calls.find(
      (call: unknown[]) => (call[1] as { action: string }).action === 'close-lock',
    );
    expect(closeLockCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// processOpenSessionLock tests
// ---------------------------------------------------------------------------

describe('processOpenSessionLock', () => {
  beforeEach(() => {
    vi.mocked(prisma.market.findUnique).mockClear();
    vi.mocked(prisma.market.update).mockClear();
    vi.mocked(redis.publish).mockClear();
  });

  // 7.5
  it('sets open_session_locked = true and publishes market:open-locked', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(
      makeDbMarket({ open_result_time: pastTime(0.5) }) as any,
    );

    await processOpenSessionLock('market-001');

    expect(prisma.market.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'market-001' },
        data: { open_session_locked: true },
      }),
    );
    expect(redis.publish).toHaveBeenCalledWith(
      'market:market-001',
      expect.stringContaining('"event":"market:open-locked"'),
    );
  });

  it('skips update when job fires early (now < open_result_time − 20 min)', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(
      makeDbMarket({ open_result_time: futureTime(2) }) as any,
    );

    await processOpenSessionLock('market-001');

    expect(prisma.market.update).not.toHaveBeenCalled();
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('does nothing when market not found', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(null);
    await processOpenSessionLock('nonexistent');
    expect(prisma.market.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processCloseSessionLock tests
// ---------------------------------------------------------------------------

describe('processCloseSessionLock', () => {
  let mockAdd: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAdd = (getMarketLockoutQueue() as { add: ReturnType<typeof vi.fn> }).add;
    mockAdd.mockClear();
    vi.mocked(prisma.market.findUnique).mockClear();
    vi.mocked(prisma.market.update).mockClear();
    vi.mocked(redis.publish).mockClear();
  });

  // 7.7
  it('sets status = locked and publishes market:locked', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(
      makeDbMarket({ close_time: pastTime(0.17), result_time: futureTime(0.5) }) as any,
    );

    await processCloseSessionLock('market-001');

    expect(prisma.market.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'market-001' },
        data: { status: 'locked' },
      }),
    );
    expect(redis.publish).toHaveBeenCalledWith(
      'market:market-001',
      expect.stringContaining('"event":"market:locked"'),
    );
  });

  // 7.6 — uses close_time not result_time for guard
  it('uses close_time (not result_time) for the guard check', async () => {
    // close_time = 10 min ago → close-lock passed → should proceed
    // result_time = 2h from now → if it used result_time, guard would FAIL
    vi.mocked(prisma.market.findUnique).mockResolvedValue(
      makeDbMarket({
        close_time: pastTime(0.17),
        result_time: futureTime(2),
      }) as any,
    );

    await processCloseSessionLock('market-001');

    // Should have proceeded (used close_time, not result_time)
    expect(prisma.market.update).toHaveBeenCalled();
  });

  it('skips update when job fires early (now < close_time − 20 min)', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(
      makeDbMarket({ close_time: futureTime(4) }) as any,
    );

    await processCloseSessionLock('market-001');

    expect(prisma.market.update).not.toHaveBeenCalled();
  });

  it('schedules a close job after result_time + 1 min', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(
      makeDbMarket({ close_time: pastTime(0.17), result_time: futureTime(0.5) }) as any,
    );

    await processCloseSessionLock('market-001');

    const closeJobCall = mockAdd.mock.calls.find(
      (call: unknown[]) => (call[1] as { action: string }).action === 'close',
    );
    expect(closeJobCall).toBeDefined();
  });

  it('does nothing when market not found', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(null);
    await processCloseSessionLock('nonexistent');
    expect(prisma.market.update).not.toHaveBeenCalled();
  });
});
