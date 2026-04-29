/**
 * Unit tests for admin service.
 *
 * Tests:
 * - approveTransaction credits correct points to wallet (deposit)
 * - approveTransaction deducts held_points and balance_points (withdrawal)
 * - rejectTransaction releases held_points (withdrawal)
 * - rejectTransaction just rejects (deposit)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionType, TransactionStatus } from '@matka/types';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
vi.mock('../../lib/prisma.js', () => {
  const mockPrisma = {
    transaction: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    wallet: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    admin: {
      update: vi.fn(),
    },
    bet: {
      findMany: vi.fn(),
    },
    resultCycle: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { default: mockPrisma };
});

import prisma from '../../lib/prisma.js';
import {
  approveTransaction,
  rejectTransaction,
  listUsers,
  getUserProfile,
  updateBetLimits,
} from './admin.service.js';
import { AppError } from '../../middleware/errorHandler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTransaction(overrides: Partial<{
  id: string;
  user_id: string;
  type: TransactionType;
  amount_points: bigint;
  balance_after: bigint;
  status: TransactionStatus;
  upi_ref: string | null;
  approved_by: string | null;
  created_at: Date;
  user: { admin_id: string };
}> = {}) {
  return {
    id: 'txn-uuid-1',
    user_id: 'user-uuid-1',
    type: TransactionType.Deposit,
    amount_points: BigInt(1000),
    balance_after: BigInt(0),
    status: TransactionStatus.Pending,
    upi_ref: 'UPI123',
    approved_by: null,
    created_at: new Date(),
    user: { admin_id: 'admin-uuid-1' },
    ...overrides,
  };
}

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
    balance_points: BigInt(5000),
    held_points: BigInt(0),
    updated_at: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// approveTransaction — deposit
// ---------------------------------------------------------------------------

describe('approveTransaction - deposit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('credits wallet balance_points on deposit approval', async () => {
    const transaction = makeTransaction({
      type: TransactionType.Deposit,
      amount_points: BigInt(1000),
    });

    vi.mocked(prisma.transaction.findUnique).mockResolvedValue(transaction);

    const walletUpdateMock = vi.fn().mockResolvedValue({});
    const transactionUpdateMock = vi.fn().mockResolvedValue({});

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const txMock = {
        wallet: {
          findUnique: vi.fn().mockResolvedValue(makeWallet({ balance_points: BigInt(5000) })),
          update: walletUpdateMock,
        },
        transaction: {
          update: transactionUpdateMock,
        },
      };
      return fn(txMock as unknown as typeof prisma);
    });

    const result = await approveTransaction('admin-uuid-1', 'txn-uuid-1');

    expect(result.success).toBe(true);
    expect(result.transaction_id).toBe('txn-uuid-1');

    // Verify wallet was credited
    expect(walletUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'user-uuid-1' },
        data: expect.objectContaining({
          balance_points: { increment: BigInt(1000) },
        }),
      }),
    );

    // Verify transaction was updated to 'approved'
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'txn-uuid-1' },
        data: expect.objectContaining({
          status: TransactionStatus.Approved,
          approved_by: 'admin-uuid-1',
        }),
      }),
    );
  });

  it('throws FORBIDDEN when transaction does not belong to admin', async () => {
    const transaction = makeTransaction({
      user: { admin_id: 'other-admin-uuid' }, // different admin
    });

    vi.mocked(prisma.transaction.findUnique).mockResolvedValue(transaction);

    await expect(approveTransaction('admin-uuid-1', 'txn-uuid-1')).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('throws FORBIDDEN when transaction is not found', async () => {
    vi.mocked(prisma.transaction.findUnique).mockResolvedValue(null);

    await expect(approveTransaction('admin-uuid-1', 'txn-uuid-1')).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('throws FORBIDDEN when transaction is not pending', async () => {
    const transaction = makeTransaction({
      status: TransactionStatus.Approved,
    });

    vi.mocked(prisma.transaction.findUnique).mockResolvedValue(transaction);

    await expect(approveTransaction('admin-uuid-1', 'txn-uuid-1')).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});

// ---------------------------------------------------------------------------
// approveTransaction — withdrawal
// ---------------------------------------------------------------------------

describe('approveTransaction - withdrawal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deducts held_points and balance_points atomically on withdrawal approval', async () => {
    const transaction = makeTransaction({
      type: TransactionType.Withdrawal,
      amount_points: BigInt(500),
      user: { admin_id: 'admin-uuid-1' },
    });

    vi.mocked(prisma.transaction.findUnique).mockResolvedValue(transaction);

    const walletUpdateMock = vi.fn().mockResolvedValue({});
    const transactionUpdateMock = vi.fn().mockResolvedValue({});

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const txMock = {
        wallet: {
          update: walletUpdateMock,
        },
        transaction: {
          update: transactionUpdateMock,
        },
      };
      return fn(txMock as unknown as typeof prisma);
    });

    const result = await approveTransaction('admin-uuid-1', 'txn-uuid-1');

    expect(result.success).toBe(true);

    // Verify both balance_points and held_points are decremented
    expect(walletUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'user-uuid-1' },
        data: expect.objectContaining({
          balance_points: { decrement: BigInt(500) },
          held_points: { decrement: BigInt(500) },
        }),
      }),
    );

    // Verify transaction was updated to 'completed'
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'txn-uuid-1' },
        data: expect.objectContaining({
          status: TransactionStatus.Completed,
          approved_by: 'admin-uuid-1',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// rejectTransaction — withdrawal
// ---------------------------------------------------------------------------

describe('rejectTransaction - withdrawal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('releases held_points on withdrawal rejection', async () => {
    const transaction = makeTransaction({
      type: TransactionType.Withdrawal,
      amount_points: BigInt(300),
      user: { admin_id: 'admin-uuid-1' },
    });

    vi.mocked(prisma.transaction.findUnique).mockResolvedValue(transaction);

    const walletUpdateMock = vi.fn().mockResolvedValue({});
    const transactionUpdateMock = vi.fn().mockResolvedValue({});

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const txMock = {
        wallet: {
          update: walletUpdateMock,
        },
        transaction: {
          update: transactionUpdateMock,
        },
      };
      return fn(txMock as unknown as typeof prisma);
    });

    const result = await rejectTransaction('admin-uuid-1', 'txn-uuid-1');

    expect(result.success).toBe(true);
    expect(result.transaction_id).toBe('txn-uuid-1');

    // Verify held_points is decremented (released)
    expect(walletUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'user-uuid-1' },
        data: expect.objectContaining({
          held_points: { decrement: BigInt(300) },
        }),
      }),
    );

    // Verify transaction was updated to 'rejected'
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'txn-uuid-1' },
        data: expect.objectContaining({
          status: TransactionStatus.Rejected,
          approved_by: 'admin-uuid-1',
        }),
      }),
    );
  });

  it('throws FORBIDDEN when transaction does not belong to admin', async () => {
    const transaction = makeTransaction({
      type: TransactionType.Withdrawal,
      user: { admin_id: 'other-admin-uuid' },
    });

    vi.mocked(prisma.transaction.findUnique).mockResolvedValue(transaction);

    await expect(rejectTransaction('admin-uuid-1', 'txn-uuid-1')).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});

// ---------------------------------------------------------------------------
// rejectTransaction — deposit
// ---------------------------------------------------------------------------

describe('rejectTransaction - deposit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects deposit without touching wallet', async () => {
    const transaction = makeTransaction({
      type: TransactionType.Deposit,
      amount_points: BigInt(1000),
      user: { admin_id: 'admin-uuid-1' },
    });

    vi.mocked(prisma.transaction.findUnique).mockResolvedValue(transaction);

    const walletUpdateMock = vi.fn().mockResolvedValue({});
    const transactionUpdateMock = vi.fn().mockResolvedValue({});

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const txMock = {
        wallet: {
          update: walletUpdateMock,
        },
        transaction: {
          update: transactionUpdateMock,
        },
      };
      return fn(txMock as unknown as typeof prisma);
    });

    const result = await rejectTransaction('admin-uuid-1', 'txn-uuid-1');

    expect(result.success).toBe(true);

    // Wallet should NOT be touched for deposit rejection
    expect(walletUpdateMock).not.toHaveBeenCalled();

    // Transaction should be rejected
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TransactionStatus.Rejected,
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// listUsers
// ---------------------------------------------------------------------------

describe('listUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns users for the given admin', async () => {
    const mockUsers = [
      { id: 'user-1', username: 'alice', is_active: true, created_at: new Date() },
      { id: 'user-2', username: 'bob', is_active: true, created_at: new Date() },
    ];

    vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as never);

    const result = await listUsers('admin-uuid-1');

    expect(result.users).toHaveLength(2);
    expect(result.users[0].username).toBe('alice');
    expect(result.users[1].username).toBe('bob');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { admin_id: 'admin-uuid-1' },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// getUserProfile
// ---------------------------------------------------------------------------

describe('getUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user profile when user belongs to admin', async () => {
    const mockUser = {
      id: 'user-uuid-1',
      username: 'alice',
      admin_id: 'admin-uuid-1',
      is_active: true,
      created_at: new Date(),
      wallet: {
        balance_points: BigInt(5000),
        held_points: BigInt(500),
      },
    };

    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);

    const result = await getUserProfile('admin-uuid-1', 'user-uuid-1');

    expect(result.user.id).toBe('user-uuid-1');
    expect(result.user.username).toBe('alice');
    expect(result.user.wallet?.balance_points).toBe(BigInt(5000));
    expect(result.user.wallet?.available_points).toBe(BigInt(4500));
  });

  it('throws FORBIDDEN when user does not belong to admin', async () => {
    const mockUser = {
      id: 'user-uuid-1',
      username: 'alice',
      admin_id: 'other-admin-uuid', // different admin
      is_active: true,
      created_at: new Date(),
      wallet: null,
    };

    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);

    await expect(getUserProfile('admin-uuid-1', 'user-uuid-1')).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('throws FORBIDDEN when user is not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(getUserProfile('admin-uuid-1', 'nonexistent-user')).rejects.toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});

// ---------------------------------------------------------------------------
// updateBetLimits
// ---------------------------------------------------------------------------

describe('updateBetLimits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates min and max bet points for admin', async () => {
    vi.mocked(prisma.admin.update).mockResolvedValue({
      id: 'admin-uuid-1',
      username: 'admin1',
      password_hash: 'hash',
      referral_code: 'CODE1234',
      is_active: true,
      min_bet_points: 50,
      max_bet_points: 5000,
      created_at: new Date(),
    });

    const result = await updateBetLimits('admin-uuid-1', 50, 5000);

    expect(result.success).toBe(true);
    expect(result.min_bet_points).toBe(50);
    expect(result.max_bet_points).toBe(5000);

    expect(prisma.admin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'admin-uuid-1' },
        data: { min_bet_points: 50, max_bet_points: 5000 },
      }),
    );
  });
});
