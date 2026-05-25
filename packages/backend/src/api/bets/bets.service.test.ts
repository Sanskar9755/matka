/**
 * Unit tests for the bet service.
 *
 * Prisma is mocked so no real database is needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BetType, MarketStatus } from '@matka/types';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
vi.mock('../../lib/prisma.js', () => {
  const mockPrisma = {
    market: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    wallet: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    bet: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    resultCycle: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { default: mockPrisma };
});

import prisma from '../../lib/prisma.js';
import { placeBet } from './bets.service.js';

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
  open_session_locked: boolean;
  updated_at: Date;
}> = {}) {
  return {
    id: 'market-uuid-1',
    name: 'Test Market',
    open_time: '12:00',
    close_time: '21:00',
    result_time: '21:30',
    status: 'open',
    is_active: true,
    open_session_locked: false,
    updated_at: new Date(),
    ...overrides,
  };
}

function makeUser(overrides: Partial<{
  id: string;
  username: string;
  admin: { id: string; min_bet_points: number; max_bet_points: number };
}> = {}) {
  return {
    id: 'user-uuid-1',
    username: 'testuser',
    admin: {
      id: 'admin-uuid-1',
      min_bet_points: 10,
      max_bet_points: 10000,
    },
    ...overrides,
  };
}

function makeWallet(overrides: Partial<{
  id: string;
  user_id: string;
  balance_points: bigint;
  held_points: bigint;
}> = {}) {
  return {
    id: 'wallet-uuid-1',
    user_id: 'user-uuid-1',
    balance_points: BigInt(5000),
    held_points: BigInt(0),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeResultCycle() {
  return {
    id: 'cycle-uuid-1',
    market_id: 'market-uuid-1',
    cycle_date: new Date(),
    open_panna: '',
    close_panna: '',
    jodi: '',
    open_ank: '',
    close_ank: '',
    calculation_done: false,
    declared_at: new Date(),
  };
}

function makeBet() {
  return {
    id: 'bet-uuid-1',
    user_id: 'user-uuid-1',
    market_id: 'market-uuid-1',
    result_cycle_id: 'cycle-uuid-1',
    bet_type: 'single',
    selection: '5',
    points: BigInt(100),
    outcome: 'pending',
    winning_amount: BigInt(0),
    placed_at: new Date(),
  };
}

let originalDate: typeof Date;

// ---------------------------------------------------------------------------
// placeBet tests
// ---------------------------------------------------------------------------

describe('placeBet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: mock current time to 10:00 (well before any lockout)
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1, 10, 0, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Market not found
  // -------------------------------------------------------------------------

  it('throws MARKET_CLOSED when market does not exist', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(null);

    await expect(
      placeBet('user-uuid-1', 'nonexistent-market', BetType.Single, '5', 100),
    ).rejects.toThrow(expect.objectContaining({ code: 'MARKET_CLOSED' }));
  });

  // -------------------------------------------------------------------------
  // Market locked
  // -------------------------------------------------------------------------

  it('throws MARKET_LOCKED when market status is locked', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(
      makeMarket({ status: MarketStatus.Locked }),
    );

    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Single, '5', 100),
    ).rejects.toThrow(expect.objectContaining({ code: 'MARKET_LOCKED' }));
  });

  it('throws MARKET_LOCKED for open-session bet when open_session_locked = true', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(
      makeMarket({ open_session_locked: true, status: 'open' }),
    );

    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Single, '5', 100, 'open'),
    ).rejects.toThrow(expect.objectContaining({ code: 'MARKET_LOCKED' }));
  });

  it('throws MARKET_LOCKED for open-session bet dynamically when time is past lockout, even if open_session_locked = false', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(
      makeMarket({ open_session_locked: false, open_time: '10:10', open_result_time: '10:10', status: 'open' }),
    );

    // Lockout is 10:10 - 20 min = 09:50. Mocked time is 10:00 (which is past lockout).
    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Single, '5', 100, 'open'),
    ).rejects.toThrow(expect.objectContaining({ code: 'MARKET_LOCKED' }));
  });

  it('accepts close-session bet when open_session_locked = true but status = open', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(
      makeMarket({ open_session_locked: true, status: 'open' }),
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());
    vi.mocked(prisma.resultCycle.upsert).mockResolvedValue(makeResultCycle());
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet());

    const mockBet = { ...makeBet(), bet_type: 'jodi', selection: '36' };
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const txMock = {
        wallet: { update: vi.fn().mockResolvedValue({}) },
        bet: { create: vi.fn().mockResolvedValue(mockBet) },
      };
      return fn(txMock as unknown as typeof prisma);
    });

    // close-session bet should succeed even when open session is locked
    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Jodi, '36', 100, 'close'),
    ).resolves.toBeDefined();
  });

  it('accepts open-session bet when open_session_locked = false and status = open', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(
      makeMarket({ open_session_locked: false, status: 'open' }),
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());
    vi.mocked(prisma.resultCycle.upsert).mockResolvedValue(makeResultCycle());
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet());

    const mockBet = makeBet();
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const txMock = {
        wallet: { update: vi.fn().mockResolvedValue({}) },
        bet: { create: vi.fn().mockResolvedValue(mockBet) },
      };
      return fn(txMock as unknown as typeof prisma);
    });

    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Single, '5', 100, 'open'),
    ).resolves.toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Market closed
  // -------------------------------------------------------------------------

  it('throws MARKET_CLOSED when market status is closed', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(
      makeMarket({ status: MarketStatus.Closed }),
    );

    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Single, '5', 100),
    ).rejects.toThrow(expect.objectContaining({ code: 'MARKET_CLOSED' }));
  });

  it('throws MARKET_CLOSED when market is_active = false', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(
      makeMarket({ status: 'open', is_active: false }),
    );

    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Single, '5', 100),
    ).rejects.toThrow(expect.objectContaining({ code: 'MARKET_CLOSED' }));
  });

  // -------------------------------------------------------------------------
  // Bet limits
  // -------------------------------------------------------------------------

  it('throws BET_BELOW_MINIMUM when points < admin.min_bet_points', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(makeMarket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      makeUser({ admin: { id: 'admin-uuid-1', min_bet_points: 50, max_bet_points: 10000 } }),
    );

    // Try to bet 10 (< min 50)
    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Single, '5', 10),
    ).rejects.toThrow(expect.objectContaining({ code: 'BET_BELOW_MINIMUM' }));
  });

  it('throws BET_ABOVE_MAXIMUM when points > admin.max_bet_points', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(makeMarket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      makeUser({ admin: { id: 'admin-uuid-1', min_bet_points: 10, max_bet_points: 500 } }),
    );

    // Try to bet 1000 (> max 500)
    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Single, '5', 1000),
    ).rejects.toThrow(expect.objectContaining({ code: 'BET_ABOVE_MAXIMUM' }));
  });

  // -------------------------------------------------------------------------
  // Invalid selection
  // -------------------------------------------------------------------------

  it('throws INVALID_SELECTION for single bet with 2 digits', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(makeMarket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());

    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Single, '55', 100),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_SELECTION' }));
  });

  it('throws INVALID_SELECTION for jodi bet with 1 digit', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(makeMarket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());

    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Jodi, '5', 100),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_SELECTION' }));
  });

  it('throws INVALID_SELECTION for jodi bet with 3 digits', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(makeMarket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());

    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Jodi, '123', 100),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_SELECTION' }));
  });

  it('throws INVALID_SELECTION for single_panna with 2 digits', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(makeMarket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());

    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.SinglePanna, '12', 100),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_SELECTION' }));
  });

  it('throws INVALID_SELECTION for half_sangam with wrong format', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(makeMarket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());

    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.HalfSangam, '123456', 100),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_SELECTION' }));
  });

  it('throws INVALID_SELECTION for full_sangam with wrong format', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(makeMarket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());

    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.FullSangam, '123456', 100),
    ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_SELECTION' }));
  });

  // -------------------------------------------------------------------------
  // Insufficient balance
  // -------------------------------------------------------------------------

  it('throws INSUFFICIENT_BALANCE when wallet balance < points', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(makeMarket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());
    vi.mocked(prisma.resultCycle.upsert).mockResolvedValue(makeResultCycle());
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(
      makeWallet({ balance_points: BigInt(50) }), // only 50 points
    );

    // Try to bet 100 (> 50 balance)
    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Single, '5', 100),
    ).rejects.toThrow(expect.objectContaining({ code: 'INSUFFICIENT_BALANCE' }));
  });

  it('throws INSUFFICIENT_BALANCE when wallet does not exist', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(makeMarket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());
    vi.mocked(prisma.resultCycle.upsert).mockResolvedValue(makeResultCycle());
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(null);

    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Single, '5', 100),
    ).rejects.toThrow(expect.objectContaining({ code: 'INSUFFICIENT_BALANCE' }));
  });

  // -------------------------------------------------------------------------
  // Successful bet placement
  // -------------------------------------------------------------------------

  it('successfully places a bet with valid inputs', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(makeMarket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());
    vi.mocked(prisma.resultCycle.upsert).mockResolvedValue(makeResultCycle());
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(
      makeWallet({ balance_points: BigInt(5000) }),
    );

    const mockBet = makeBet();
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const txMock = {
        wallet: { update: vi.fn().mockResolvedValue({}) },
        bet: { create: vi.fn().mockResolvedValue(mockBet) },
      };
      return fn(txMock as unknown as typeof prisma);
    });

    const result = await placeBet('user-uuid-1', 'market-uuid-1', BetType.Single, '5', 100);

    expect(result.bet.selection).toBe('5');
    expect(result.bet.bet_type).toBe(BetType.Single);
    expect(result.bet.points).toBe(BigInt(100));
  });

  // -------------------------------------------------------------------------
  // Valid selection formats
  // -------------------------------------------------------------------------

  it('accepts valid single selection (single digit)', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(makeMarket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());
    vi.mocked(prisma.resultCycle.upsert).mockResolvedValue(makeResultCycle());
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet());

    const mockBet = makeBet();
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const txMock = {
        wallet: { update: vi.fn().mockResolvedValue({}) },
        bet: { create: vi.fn().mockResolvedValue(mockBet) },
      };
      return fn(txMock as unknown as typeof prisma);
    });

    // Should not throw
    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.Single, '0', 100),
    ).resolves.toBeDefined();
  });

  it('accepts valid half_sangam selection (DDD-D format)', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(makeMarket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());
    vi.mocked(prisma.resultCycle.upsert).mockResolvedValue(makeResultCycle());
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet());

    const mockBet = { ...makeBet(), bet_type: 'half_sangam', selection: '123-5' };
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const txMock = {
        wallet: { update: vi.fn().mockResolvedValue({}) },
        bet: { create: vi.fn().mockResolvedValue(mockBet) },
      };
      return fn(txMock as unknown as typeof prisma);
    });

    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.HalfSangam, '123-5', 100),
    ).resolves.toBeDefined();
  });

  it('accepts valid full_sangam selection (DDD-DDD format)', async () => {
    vi.mocked(prisma.market.findUnique).mockResolvedValue(makeMarket());
    vi.mocked(prisma.user.findUnique).mockResolvedValue(makeUser());
    vi.mocked(prisma.resultCycle.upsert).mockResolvedValue(makeResultCycle());
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet());

    const mockBet = { ...makeBet(), bet_type: 'full_sangam', selection: '123-456' };
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const txMock = {
        wallet: { update: vi.fn().mockResolvedValue({}) },
        bet: { create: vi.fn().mockResolvedValue(mockBet) },
      };
      return fn(txMock as unknown as typeof prisma);
    });

    await expect(
      placeBet('user-uuid-1', 'market-uuid-1', BetType.FullSangam, '123-456', 100),
    ).resolves.toBeDefined();
  });
});
