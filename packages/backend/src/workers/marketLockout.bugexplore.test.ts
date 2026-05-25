/**
 * Bug Condition Exploration Test — Market Lock Timing Fix
 *
 * This test asserts the CORRECT/FIXED behavior:
 *   - scheduleMarketLockout should schedule TWO jobs when open_result_time is set
 *   - One job should have action='open-lock'
 *
 * On UNFIXED code: test FAILS (only 1 job scheduled, no open-lock) → BUG CONFIRMED
 * On FIXED code:   test PASSES (2 jobs scheduled, open-lock present)
 *
 * Validates: Bug Condition 1.4 — scheduleMarketLockout schedules only one delayed job
 * and skips scheduling any job for open_result_time.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the BullMQ lib so we never touch Redis in tests
// ---------------------------------------------------------------------------

const mockAdd = vi.fn().mockResolvedValue({ id: 'mock-job-id' });
const mockQueue = { add: mockAdd };

vi.mock('../lib/bullmq.js', () => ({
  getMarketLockoutQueue: () => mockQueue,
  QUEUE_MARKET_LOCKOUT: 'market-lockout',
  createWorker: vi.fn(),
}));

// Import AFTER mocking
import { scheduleMarketLockout } from './marketLockout.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a time string HH:MM for `hoursFromNow` hours in the future. */
function futureTime(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bug Condition Exploration: scheduleMarketLockout open-lock scheduling', () => {
  beforeEach(() => {
    mockAdd.mockClear();
  });

  it('should schedule TWO jobs when open_result_time is set and both lock times are in the future', async () => {
    // open_result_time is 2 hours from now → open-lock fires in ~1h40m
    // close_time is 4 hours from now → close-lock fires in ~3h40m
    const market = {
      id: 'market-test-001',
      open_result_time: futureTime(2),
      close_time: futureTime(4),
      result_time: futureTime(4),
      is_active: true,
    } as any; // cast because current MarketScheduleInput lacks open_result_time

    await scheduleMarketLockout(market);

    // FIXED behavior: exactly 2 jobs should be scheduled
    expect(mockAdd).toHaveBeenCalledTimes(2);
  });

  it('should schedule a job with action="open-lock" for the open session', async () => {
    const market = {
      id: 'market-test-002',
      open_result_time: futureTime(2),
      close_time: futureTime(4),
      result_time: futureTime(4),
      is_active: true,
    } as any;

    await scheduleMarketLockout(market);

    // Collect all job data payloads passed to queue.add
    const allJobData = mockAdd.mock.calls.map((call) => call[1]);

    // FIXED behavior: at least one job should have action='open-lock'
    const hasOpenLockJob = allJobData.some((data: any) => data?.action === 'open-lock');
    expect(hasOpenLockJob).toBe(true);
  });
});
