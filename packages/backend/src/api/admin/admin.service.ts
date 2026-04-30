/**
 * Admin service.
 *
 * Handles user management, transaction approval/rejection, bet limits,
 * and the live bet dashboard for admins.
 */

import prisma from '../../lib/prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { TransactionType, TransactionStatus, BetType } from '@matka/types';

// ---------------------------------------------------------------------------
// listUsers
// ---------------------------------------------------------------------------

export interface UserSummary {
  id: string;
  username: string;
  is_active: boolean;
  created_at: Date;
  balance_points: number;
  held_points: number;
  available_points: number;
}

export interface ListUsersResult {
  users: UserSummary[];
}

/**
 * List all users managed by the given admin — includes wallet balance.
 */
export async function listUsers(adminId: string): Promise<ListUsersResult> {
  const users = await prisma.user.findMany({
    where: { admin_id: adminId },
    select: {
      id: true,
      username: true,
      is_active: true,
      created_at: true,
      wallet: {
        select: {
          balance_points: true,
          held_points: true,
        },
      },
    },
    orderBy: { created_at: 'desc' },
  });

  return {
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      is_active: u.is_active,
      created_at: u.created_at,
      balance_points: Number(u.wallet?.balance_points ?? 0),
      held_points: Number(u.wallet?.held_points ?? 0),
      available_points: Number((u.wallet?.balance_points ?? 0n) - (u.wallet?.held_points ?? 0n)),
    })),
  };
}

// ---------------------------------------------------------------------------
// getUserProfile
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: string;
  username: string;
  is_active: boolean;
  created_at: Date;
  wallet: {
    balance_points: bigint;
    held_points: bigint;
    available_points: bigint;
  } | null;
}

export interface GetUserProfileResult {
  user: UserProfile;
}

/**
 * Get a user's profile. Validates that the user belongs to the given admin.
 * Throws FORBIDDEN if the user is not under this admin.
 */
export async function getUserProfile(
  adminId: string,
  userId: string,
): Promise<GetUserProfileResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      wallet: true,
    },
  });

  if (!user) {
    throw new AppError('FORBIDDEN');
  }

  if (user.admin_id !== adminId) {
    throw new AppError('FORBIDDEN');
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      is_active: user.is_active,
      created_at: user.created_at,
      wallet: user.wallet
        ? {
            balance_points: user.wallet.balance_points,
            held_points: user.wallet.held_points,
            available_points: user.wallet.balance_points - user.wallet.held_points,
          }
        : null,
    },
  };
}

// ---------------------------------------------------------------------------
// listPendingTransactions
// ---------------------------------------------------------------------------

export interface PendingTransaction {
  id: string;
  user_id: string;
  username: string;
  type: TransactionType;
  amount_points: bigint;
  status: TransactionStatus;
  upi_ref: string | null;
  created_at: Date;
}

export interface ListPendingTransactionsResult {
  transactions: PendingTransaction[];
}

/**
 * List all pending transactions for users under the given admin.
 */
export async function listPendingTransactions(
  adminId: string,
): Promise<ListPendingTransactionsResult> {
  const transactions = await prisma.transaction.findMany({
    where: {
      status: TransactionStatus.Pending,
      user: {
        admin_id: adminId,
      },
    },
    include: {
      user: {
        select: { username: true },
      },
    },
    orderBy: { created_at: 'asc' },
  });

  return {
    transactions: transactions.map((t) => ({
      id: t.id,
      user_id: t.user_id,
      username: t.user.username,
      type: t.type as TransactionType,
      amount_points: t.amount_points,
      status: t.status as TransactionStatus,
      upi_ref: t.upi_ref,
      created_at: t.created_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// approveTransaction
// ---------------------------------------------------------------------------

export interface ApproveTransactionResult {
  success: true;
  transaction_id: string;
}

/**
 * Approve a pending transaction.
 *
 * For deposit:
 *   - Credit wallet (increment balance_points)
 *   - Update transaction status to 'approved'
 *
 * For withdrawal:
 *   - Deduct held_points and balance_points
 *   - Update transaction status to 'completed'
 *
 * All operations are atomic in a Prisma transaction.
 */
export async function approveTransaction(
  adminId: string,
  transactionId: string,
): Promise<ApproveTransactionResult> {
  // Fetch transaction with user info
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      user: {
        select: { admin_id: true },
      },
    },
  });

  if (!transaction) {
    throw new AppError('FORBIDDEN');
  }

  // Validate ownership
  if (transaction.user.admin_id !== adminId) {
    throw new AppError('FORBIDDEN');
  }

  if (transaction.status !== TransactionStatus.Pending) {
    throw new AppError('FORBIDDEN');
  }

  await prisma.$transaction(async (tx) => {
    if (transaction.type === TransactionType.Deposit) {
      // Credit wallet
      const wallet = await tx.wallet.findUnique({
        where: { user_id: transaction.user_id },
      });

      const newBalance = (wallet?.balance_points ?? BigInt(0)) + transaction.amount_points;

      await tx.wallet.update({
        where: { user_id: transaction.user_id },
        data: {
          balance_points: { increment: transaction.amount_points },
        },
      });

      // Update transaction status to 'approved' with balance_after
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.Approved,
          approved_by: adminId,
          balance_after: newBalance,
        },
      });
    } else if (transaction.type === TransactionType.Withdrawal) {
      // Deduct held_points and balance_points
      await tx.wallet.update({
        where: { user_id: transaction.user_id },
        data: {
          balance_points: { decrement: transaction.amount_points },
          held_points: { decrement: transaction.amount_points },
        },
      });

      // Update transaction status to 'completed'
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.Completed,
          approved_by: adminId,
        },
      });
    } else {
      throw new AppError('FORBIDDEN');
    }
  });

  return { success: true, transaction_id: transactionId };
}

// ---------------------------------------------------------------------------
// rejectTransaction
// ---------------------------------------------------------------------------

export interface RejectTransactionResult {
  success: true;
  transaction_id: string;
}

/**
 * Reject a pending transaction.
 *
 * For withdrawal:
 *   - Release held_points (decrement held_points)
 *   - Update transaction status to 'rejected'
 *
 * For deposit:
 *   - Just update status to 'rejected'
 */
export async function rejectTransaction(
  adminId: string,
  transactionId: string,
): Promise<RejectTransactionResult> {
  // Fetch transaction with user info
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      user: {
        select: { admin_id: true },
      },
    },
  });

  if (!transaction) {
    throw new AppError('FORBIDDEN');
  }

  // Validate ownership
  if (transaction.user.admin_id !== adminId) {
    throw new AppError('FORBIDDEN');
  }

  if (transaction.status !== TransactionStatus.Pending) {
    throw new AppError('FORBIDDEN');
  }

  await prisma.$transaction(async (tx) => {
    if (transaction.type === TransactionType.Withdrawal) {
      // Release held_points
      await tx.wallet.update({
        where: { user_id: transaction.user_id },
        data: {
          held_points: { decrement: transaction.amount_points },
        },
      });
    }

    // Update transaction status to 'rejected'
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status: TransactionStatus.Rejected,
        approved_by: adminId,
      },
    });
  });

  return { success: true, transaction_id: transactionId };
}

// ---------------------------------------------------------------------------
// updateBetLimits
// ---------------------------------------------------------------------------

export interface UpdateBetLimitsResult {
  success: true;
  min_bet_points: number;
  max_bet_points: number;
}

/**
 * Update the admin's min and max bet points configuration.
 */
export async function updateBetLimits(
  adminId: string,
  min: number,
  max: number,
): Promise<UpdateBetLimitsResult> {
  const admin = await prisma.admin.update({
    where: { id: adminId },
    data: {
      min_bet_points: min,
      max_bet_points: max,
    },
  });

  return {
    success: true,
    min_bet_points: admin.min_bet_points,
    max_bet_points: admin.max_bet_points,
  };
}

// ---------------------------------------------------------------------------
// getLiveBetDashboard
// ---------------------------------------------------------------------------

export interface BetDashboardEntry {
  id: string;
  user_id: string;
  username: string;
  market_name: string;
  bet_type: BetType;
  selection: string;
  points: bigint;
  placed_at: Date;
}

export interface BetTypeTotals {
  bet_type: BetType;
  total_points: bigint;
  count: number;
}

export interface LiveBetDashboardResult {
  bets: BetDashboardEntry[];
  totals: BetTypeTotals[];
}

/**
 * Get all bets for a market's current result cycle, grouped by bet_type
 * with running totals. Shows market name in results.
 * Uses latest result cycle (not just today's date).
 */
export async function getLiveBetDashboard(
  adminId: string,
  marketId: string,
): Promise<LiveBetDashboardResult> {
  // Get market name
  const market = await prisma.market.findUnique({
    where: { id: marketId },
    select: { name: true },
  });

  // Find the LATEST result cycle for this market (not just today)
  const resultCycle = await prisma.resultCycle.findFirst({
    where: { market_id: marketId },
    orderBy: { cycle_date: 'desc' },
  });

  if (!resultCycle) {
    return { bets: [], totals: [] };
  }

  // Fetch all bets for this cycle that belong to users under this admin
  const bets = await prisma.bet.findMany({
    where: {
      result_cycle_id: resultCycle.id,
      user: {
        admin_id: adminId,
      },
    },
    include: {
      user: { select: { username: true } },
    },
    orderBy: { placed_at: 'desc' },
  });

  // Compute totals per bet_type
  const totalsMap = new Map<BetType, { total_points: bigint; count: number }>();

  for (const bet of bets) {
    const betType = bet.bet_type as BetType;
    const existing = totalsMap.get(betType) ?? { total_points: BigInt(0), count: 0 };
    totalsMap.set(betType, {
      total_points: existing.total_points + bet.points,
      count: existing.count + 1,
    });
  }

  const totals: BetTypeTotals[] = Array.from(totalsMap.entries()).map(([bet_type, data]) => ({
    bet_type,
    total_points: data.total_points,
    count: data.count,
  }));

  return {
    bets: bets.map((bet) => ({
      id: bet.id,
      user_id: bet.user_id,
      username: (bet as typeof bet & { user: { username: string } }).user.username,
      market_name: market?.name ?? '',
      bet_type: bet.bet_type as BetType,
      selection: bet.selection,
      points: bet.points,
      placed_at: bet.placed_at,
    })),
    totals,
  };
}

// ---------------------------------------------------------------------------
// getBetAnalysis — Detailed bet totals per number/panna for each bet type
// ---------------------------------------------------------------------------

export interface BetAnalysisEntry {
  selection: string;
  total_points: number;
  bet_count: number;
}

export interface BetAnalysisResult {
  market_id: string;
  single: BetAnalysisEntry[];      // 0-9
  jodi: BetAnalysisEntry[];        // 00-99
  single_panna: BetAnalysisEntry[];
  double_panna: BetAnalysisEntry[];
  triple_panna: BetAnalysisEntry[];
  half_sangam: BetAnalysisEntry[];
  full_sangam: BetAnalysisEntry[];
  summary: {
    bet_type: string;
    total_points: number;
    bet_count: number;
  }[];
}

/**
 * Get detailed bet analysis for a market — totals per number/panna per bet type.
 * Shows admin exactly how much is bet on each number.
 */
export async function getBetAnalysis(
  adminId: string,
  marketId: string,
): Promise<BetAnalysisResult> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Find latest result cycle (not just today)
  const resultCycle = await prisma.resultCycle.findFirst({
    where: { market_id: marketId },
    orderBy: { cycle_date: 'desc' },
  });

  if (!resultCycle) {
    return {
      market_id: marketId,
      single: [],
      jodi: [],
      single_panna: [],
      double_panna: [],
      triple_panna: [],
      half_sangam: [],
      full_sangam: [],
      summary: [],
    };
  }

  // Fetch all bets for this cycle under this admin
  const bets = await prisma.bet.findMany({
    where: {
      result_cycle_id: resultCycle.id,
      user: { admin_id: adminId },
    },
    select: {
      bet_type: true,
      selection: true,
      points: true,
    },
  });

  // Group by bet_type → selection → sum points
  const groups: Record<string, Record<string, { total: bigint; count: number }>> = {
    single: {},
    jodi: {},
    single_panna: {},
    double_panna: {},
    triple_panna: {},
    half_sangam: {},
    full_sangam: {},
  };

  for (const bet of bets) {
    const type = bet.bet_type as string;
    if (!groups[type]) continue;
    const existing = groups[type][bet.selection] ?? { total: BigInt(0), count: 0 };
    groups[type][bet.selection] = {
      total: existing.total + bet.points,
      count: existing.count + 1,
    };
  }

  // Convert to sorted arrays
  function toSortedEntries(group: Record<string, { total: bigint; count: number }>): BetAnalysisEntry[] {
    return Object.entries(group)
      .map(([selection, data]) => ({
        selection,
        total_points: Number(data.total),
        bet_count: data.count,
      }))
      .sort((a, b) => b.total_points - a.total_points); // highest first
  }

  // Summary per bet type
  const summary = Object.entries(groups).map(([bet_type, group]) => {
    const total_points = Object.values(group).reduce((s, d) => s + Number(d.total), 0);
    const bet_count = Object.values(group).reduce((s, d) => s + d.count, 0);
    return { bet_type, total_points, bet_count };
  }).filter(s => s.bet_count > 0);

  return {
    market_id: marketId,
    single: toSortedEntries(groups['single'] ?? {}),
    jodi: toSortedEntries(groups['jodi'] ?? {}),
    single_panna: toSortedEntries(groups['single_panna'] ?? {}),
    double_panna: toSortedEntries(groups['double_panna'] ?? {}),
    triple_panna: toSortedEntries(groups['triple_panna'] ?? {}),
    half_sangam: toSortedEntries(groups['half_sangam'] ?? {}),
    full_sangam: toSortedEntries(groups['full_sangam'] ?? {}),
    summary,
  };
}
