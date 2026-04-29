/**
 * Unit tests for the wallet service.
 *
 * Prisma is mocked so no real database is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../middleware/errorHandler.js';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
vi.mock('../../lib/prisma.js', () => {
  const mockPrisma = {
    wallet: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { default: mockPrisma };
});

import prisma from '../../lib/prisma.js';
import { getBalance, submitWithdrawal, submitDeposit, getTransactionHistory } from './wallet.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWallet(overrides: Partial<{
  id: string;
  user_id: string;
  balance_points: bigint;
  held_points: bigint;
  updated_at: Date;
}> = {}) {
  return {
    id: 'wallet-uuid-1',
    user_id: 'user-uuid-1',
    balance_points: BigInt(1000),
    held_points: BigInt(0),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<{
  id: string;
  user_id: string;
  type: string;
  amount_points: bigint;
  balance_after: bigint;
  status: string;
  upi_ref: string | null;
  approved_by: string | null;
  created_at: Date;
}> = {}) {
  return {
    id: 'tx-uuid-1',
    user_id: 'user-uuid-1',
    type: 'withdrawal',
    amount_points: BigInt(100),
    balance_after: BigInt(1000),
    status: 'pending',
    upi_ref: null,
    approved_by: null,
    created_at: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getBalance tests
// ---------------------------------------------------------------------------

describe('getBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns balance_points, held_points, and available_points', async () => {
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(
      makeWallet({ balance_points: BigInt(1000), held_points: BigInt(200) }),
    );

    const result = await getBalance('user-uuid-1');

    expect(result.balance_points).toBe(BigInt(1000));
    expect(result.held_points).toBe(BigInt(200));
    expect(result.available_points).toBe(BigInt(800));
  });

  it('returns zero balances when wallet does not exist', async () => {
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(null);

    const result = await getBalance('user-uuid-1');

    expect(result.balance_points).toBe(BigInt(0));
    expect(result.held_points).toBe(BigInt(0));
    expect(result.available_points).toBe(BigInt(0));
  });
});

// ---------------------------------------------------------------------------
// submitWithdrawal tests
// ---------------------------------------------------------------------------

describe('submitWithdrawal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws WITHDRAWAL_EXCEEDS_BALANCE when wallet does not exist', async () => {
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(null);

    await expect(submitWithdrawal('user-uuid-1', 100)).rejects.toThrow(
      expect.objectContaining({ code: 'WITHDRAWAL_EXCEEDS_BALANCE' }),
    );
  });

  it('throws WITHDRAWAL_EXCEEDS_BALANCE when withdrawal exceeds available balance', async () => {
    // balance=1000, held=200, available=800
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(
      makeWallet({ balance_points: BigInt(1000), held_points: BigInt(200) }),
    );

    // Try to withdraw 900 (> 800 available)
    await expect(submitWithdrawal('user-uuid-1', 900)).rejects.toThrow(
      expect.objectContaining({ code: 'WITHDRAWAL_EXCEEDS_BALANCE' }),
    );
  });

  it('throws WITHDRAWAL_EXCEEDS_BALANCE when withdrawal equals exactly more than available', async () => {
    // balance=500, held=0, available=500
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(
      makeWallet({ balance_points: BigInt(500), held_points: BigInt(0) }),
    );

    // Try to withdraw 501 (> 500 available)
    await expect(submitWithdrawal('user-uuid-1', 501)).rejects.toThrow(
      expect.objectContaining({ code: 'WITHDRAWAL_EXCEEDS_BALANCE' }),
    );
  });

  it('succeeds when withdrawal equals exactly available balance', async () => {
    // balance=500, held=0, available=500
    const wallet = makeWallet({ balance_points: BigInt(500), held_points: BigInt(0) });
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(wallet);

    const mockTx = makeTransaction({ amount_points: BigInt(500) });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const txMock = {
        transaction: { create: vi.fn().mockResolvedValue(mockTx) },
        wallet: { update: vi.fn().mockResolvedValue(wallet) },
      };
      return fn(txMock as unknown as typeof prisma);
    });

    const result = await submitWithdrawal('user-uuid-1', 500);

    expect(result.transaction.amount_points).toBe(BigInt(500));
    expect(result.transaction.status).toBe('pending');
  });

  it('creates transaction and increments held_points atomically', async () => {
    const wallet = makeWallet({ balance_points: BigInt(1000), held_points: BigInt(0) });
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(wallet);

    const mockTx = makeTransaction({ amount_points: BigInt(300) });
    const txCreate = vi.fn().mockResolvedValue(mockTx);
    const walletUpdate = vi.fn().mockResolvedValue(wallet);

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const txMock = {
        transaction: { create: txCreate },
        wallet: { update: walletUpdate },
      };
      return fn(txMock as unknown as typeof prisma);
    });

    await submitWithdrawal('user-uuid-1', 300);

    // Verify held_points was incremented
    expect(walletUpdate).toHaveBeenCalledWith({
      where: { user_id: 'user-uuid-1' },
      data: { held_points: { increment: BigInt(300) } },
    });
  });
});

// ---------------------------------------------------------------------------
// submitDeposit tests
// ---------------------------------------------------------------------------

describe('submitDeposit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a pending deposit transaction', async () => {
    const wallet = makeWallet({ balance_points: BigInt(500) });
    vi.mocked(prisma.wallet.findUnique).mockResolvedValue(wallet);

    const mockTx = makeTransaction({
      type: 'deposit',
      amount_points: BigInt(200),
      upi_ref: 'UPI123',
    });
    vi.mocked(prisma.transaction.create).mockResolvedValue(mockTx);

    const result = await submitDeposit('user-uuid-1', 'UPI123', 200);

    expect(result.transaction.type).toBe('deposit');
    expect(result.transaction.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// getTransactionHistory tests
// ---------------------------------------------------------------------------

describe('getTransactionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns transactions ordered by created_at desc', async () => {
    const transactions = [
      makeTransaction({ id: 'tx-1', created_at: new Date('2024-01-02') }),
      makeTransaction({ id: 'tx-2', created_at: new Date('2024-01-01') }),
    ];
    vi.mocked(prisma.transaction.findMany).mockResolvedValue(transactions);

    const result = await getTransactionHistory('user-uuid-1');

    expect(result.transactions).toHaveLength(2);
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: { user_id: 'user-uuid-1' },
      orderBy: { created_at: 'desc' },
    });
  });
});
