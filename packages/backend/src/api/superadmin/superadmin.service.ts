/**
 * SuperAdmin service.
 *
 * Handles admin management, platform analytics, configuration,
 * and manual result entry.
 */

import bcrypt from 'bcrypt';
import prisma from '../../lib/prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { TransactionType, TransactionStatus } from '@matka/types';
import { enqueueWinningCalculation } from '../../workers/winningCalculation.js';
import redis from '../../lib/redis.js';

const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Referral code generation
// ---------------------------------------------------------------------------

/**
 * Generate a random 8-character uppercase alphanumeric referral code.
 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generate a unique referral code that doesn't already exist in the DB.
 */
async function generateUniqueReferralCode(): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateReferralCode();
    const existing = await prisma.admin.findUnique({
      where: { referral_code: code },
    });
    if (!existing) {
      return code;
    }
  }
  throw new Error('Failed to generate a unique referral code after multiple attempts.');
}

// ---------------------------------------------------------------------------
// createAdmin
// ---------------------------------------------------------------------------

export interface CreateAdminData {
  username: string;
  password: string;
}

export interface AdminRecord {
  id: string;
  username: string;
  referral_code: string;
  is_active: boolean;
  min_bet_points: number;
  max_bet_points: number;
  created_at: Date;
}

export interface CreateAdminResult {
  admin: AdminRecord;
}

/**
 * Create a new Admin account.
 * - Checks username uniqueness
 * - Hashes password
 * - Generates unique referral_code
 */
export async function createAdmin(data: CreateAdminData): Promise<CreateAdminResult> {
  // Check username uniqueness across both tables
  const [existingAdmin, existingUser] = await Promise.all([
    prisma.admin.findUnique({ where: { username: data.username } }),
    prisma.user.findUnique({ where: { username: data.username } }),
  ]);

  if (existingAdmin || existingUser) {
    throw new AppError('USERNAME_TAKEN');
  }

  const password_hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const referral_code = await generateUniqueReferralCode();

  const admin = await prisma.admin.create({
    data: {
      username: data.username,
      password_hash,
      referral_code,
      is_active: true,
    },
  });

  return {
    admin: {
      id: admin.id,
      username: admin.username,
      referral_code: admin.referral_code,
      is_active: admin.is_active,
      min_bet_points: admin.min_bet_points,
      max_bet_points: admin.max_bet_points,
      created_at: admin.created_at,
    },
  };
}

// ---------------------------------------------------------------------------
// updateAdmin
// ---------------------------------------------------------------------------

export interface UpdateAdminData {
  username?: string;
  password?: string;
  min_bet_points?: number;
  max_bet_points?: number;
}

export interface UpdateAdminResult {
  admin: AdminRecord;
}

/**
 * Update admin fields.
 */
export async function updateAdmin(id: string, data: UpdateAdminData): Promise<UpdateAdminResult> {
  const updateData: Record<string, unknown> = {};

  if (data.username !== undefined) {
    // Check uniqueness if changing username
    const existing = await prisma.admin.findFirst({
      where: { username: data.username, NOT: { id } },
    });
    if (existing) {
      throw new AppError('USERNAME_TAKEN');
    }
    updateData['username'] = data.username;
  }

  if (data.password !== undefined) {
    updateData['password_hash'] = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  }

  if (data.min_bet_points !== undefined) {
    updateData['min_bet_points'] = data.min_bet_points;
  }

  if (data.max_bet_points !== undefined) {
    updateData['max_bet_points'] = data.max_bet_points;
  }

  const admin = await prisma.admin.update({
    where: { id },
    data: updateData,
  });

  return {
    admin: {
      id: admin.id,
      username: admin.username,
      referral_code: admin.referral_code,
      is_active: admin.is_active,
      min_bet_points: admin.min_bet_points,
      max_bet_points: admin.max_bet_points,
      created_at: admin.created_at,
    },
  };
}

// ---------------------------------------------------------------------------
// setAdminStatus
// ---------------------------------------------------------------------------

export interface SetAdminStatusResult {
  admin: AdminRecord;
}

/**
 * Activate or deactivate an admin account.
 */
export async function setAdminStatus(
  id: string,
  isActive: boolean,
): Promise<SetAdminStatusResult> {
  const admin = await prisma.admin.update({
    where: { id },
    data: { is_active: isActive },
  });

  return {
    admin: {
      id: admin.id,
      username: admin.username,
      referral_code: admin.referral_code,
      is_active: admin.is_active,
      min_bet_points: admin.min_bet_points,
      max_bet_points: admin.max_bet_points,
      created_at: admin.created_at,
    },
  };
}

// ---------------------------------------------------------------------------
// deleteAdmin
// ---------------------------------------------------------------------------

/**
 * Delete an admin account.
 * Cannot delete superadmin (username === 'superadmin').
 */
export async function deleteAdmin(id: string): Promise<void> {
  const admin = await prisma.admin.findUnique({ where: { id } });
  if (!admin) throw new AppError('NOT_FOUND');
  if (admin.username === 'superadmin' || admin.referral_code === 'SUPERADMIN') {
    throw new AppError('FORBIDDEN');
  }
  await prisma.admin.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// listAdmins
// ---------------------------------------------------------------------------

export interface ListAdminsResult {
  admins: AdminRecord[];
}

/**
 * List all admin accounts (excluding password_hash).
 */
export async function listAdmins(): Promise<ListAdminsResult> {
  const admins = await prisma.admin.findMany({
    select: {
      id: true,
      username: true,
      referral_code: true,
      is_active: true,
      min_bet_points: true,
      max_bet_points: true,
      created_at: true,
    },
    orderBy: { created_at: 'asc' },
  });

  return { admins };
}

// ---------------------------------------------------------------------------
// getAnalytics
// ---------------------------------------------------------------------------

export interface AnalyticsResult {
  total_users: number;
  total_deposited: bigint;
  total_withdrawn: bigint;
  platform_revenue: bigint;
}

/**
 * Get global platform analytics:
 * - total_users: count of all users
 * - total_deposited: sum of approved deposit transactions
 * - total_withdrawn: sum of completed withdrawal transactions
 * - platform_revenue: sum of all bet_deduction transactions - sum of all winning_credit transactions
 */
export async function getAnalytics(): Promise<AnalyticsResult> {
  const [
    totalUsers,
    depositAgg,
    withdrawalAgg,
    betDeductionAgg,
    winningCreditAgg,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.transaction.aggregate({
      where: {
        type: TransactionType.Deposit,
        status: TransactionStatus.Approved,
      },
      _sum: { amount_points: true },
    }),
    prisma.transaction.aggregate({
      where: {
        type: TransactionType.Withdrawal,
        status: TransactionStatus.Completed,
      },
      _sum: { amount_points: true },
    }),
    prisma.transaction.aggregate({
      where: { type: TransactionType.BetDeduction },
      _sum: { amount_points: true },
    }),
    prisma.transaction.aggregate({
      where: { type: TransactionType.WinningCredit },
      _sum: { amount_points: true },
    }),
  ]);

  const totalDeposited = depositAgg._sum.amount_points ?? BigInt(0);
  const totalWithdrawn = withdrawalAgg._sum.amount_points ?? BigInt(0);
  const totalBetDeductions = betDeductionAgg._sum.amount_points ?? BigInt(0);
  const totalWinningCredits = winningCreditAgg._sum.amount_points ?? BigInt(0);
  const platformRevenue = totalBetDeductions - totalWinningCredits;

  return {
    total_users: totalUsers,
    total_deposited: totalDeposited,
    total_withdrawn: totalWithdrawn,
    platform_revenue: platformRevenue,
  };
}

// ---------------------------------------------------------------------------
// getConfig
// ---------------------------------------------------------------------------

export interface PlatformConfigRecord {
  id: string;
  winning_multipliers: Record<string, number>;
  result_api_endpoint: string;
  result_poll_interval_sec: number;
  upi_details: string;
  feature_flags: Record<string, boolean>;
  updated_at: Date;
}

export interface GetConfigResult {
  config: PlatformConfigRecord;
}

/**
 * Get the platform configuration.
 */
export async function getConfig(): Promise<GetConfigResult> {
  const config = await prisma.platformConfig.findFirst();

  if (!config) {
    throw new Error('PlatformConfig not found.');
  }

  return {
    config: {
      id: config.id,
      winning_multipliers: config.winning_multipliers as Record<string, number>,
      result_api_endpoint: config.result_api_endpoint,
      result_poll_interval_sec: config.result_poll_interval_sec,
      upi_details: config.upi_details,
      feature_flags: config.feature_flags as Record<string, boolean>,
      updated_at: config.updated_at,
    },
  };
}

// ---------------------------------------------------------------------------
// updateConfig
// ---------------------------------------------------------------------------

export interface UpdateConfigData {
  winning_multipliers?: Record<string, number>;
  result_api_endpoint?: string;
  result_poll_interval_sec?: number;
  upi_details?: string;
  feature_flags?: Record<string, boolean>;
}

export interface UpdateConfigResult {
  config: PlatformConfigRecord;
}

/**
 * Update the platform configuration.
 */
export async function updateConfig(data: UpdateConfigData): Promise<UpdateConfigResult> {
  const existing = await prisma.platformConfig.findFirst();

  if (!existing) {
    throw new Error('PlatformConfig not found.');
  }

  const updateData: Record<string, unknown> = {};

  if (data.winning_multipliers !== undefined) {
    updateData['winning_multipliers'] = data.winning_multipliers;
  }
  if (data.result_api_endpoint !== undefined) {
    updateData['result_api_endpoint'] = data.result_api_endpoint;
  }
  if (data.result_poll_interval_sec !== undefined) {
    updateData['result_poll_interval_sec'] = data.result_poll_interval_sec;
  }
  if (data.upi_details !== undefined) {
    updateData['upi_details'] = data.upi_details;
  }
  if (data.feature_flags !== undefined) {
    updateData['feature_flags'] = data.feature_flags;
  }

  const config = await prisma.platformConfig.update({
    where: { id: existing.id },
    data: updateData,
  });

  return {
    config: {
      id: config.id,
      winning_multipliers: config.winning_multipliers as Record<string, number>,
      result_api_endpoint: config.result_api_endpoint,
      result_poll_interval_sec: config.result_poll_interval_sec,
      upi_details: config.upi_details,
      feature_flags: config.feature_flags as Record<string, boolean>,
      updated_at: config.updated_at,
    },
  };
}

// ---------------------------------------------------------------------------
// manuallyEnterResult
// ---------------------------------------------------------------------------

export interface ResultData {
  open_panna: string;
  close_panna: string;
  jodi: string;
  open_ank: string;
  close_ank: string;
}

export interface ManuallyEnterResultResult {
  result_cycle_id: string;
  enqueued: boolean;
}

/**
 * Manually enter a result for a market.
 * Upserts the ResultCycle and enqueues a winning-calculation job.
 */
export async function manuallyEnterResult(
  marketId: string,
  resultData: ResultData,
): Promise<ManuallyEnterResultResult> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const resultCycle = await prisma.resultCycle.upsert({
    where: {
      idx_result_cycles_market_date: {
        market_id: marketId,
        cycle_date: today,
      },
    },
    create: {
      market_id: marketId,
      cycle_date: today,
      open_panna: resultData.open_panna,
      close_panna: resultData.close_panna,
      jodi: resultData.jodi,
      open_ank: resultData.open_ank,
      close_ank: resultData.close_ank,
      calculation_done: false,
      declared_at: now,
    },
    update: {
      open_panna: resultData.open_panna,
      close_panna: resultData.close_panna,
      jodi: resultData.jodi,
      open_ank: resultData.open_ank,
      close_ank: resultData.close_ank,
      declared_at: now,
      // Reset calculation_done so it can be recalculated
      calculation_done: false,
    },
  });

  // Enqueue winning-calculation job
  await enqueueWinningCalculation(marketId, resultCycle.id);

  // Broadcast result to all connected clients via Redis pub/sub → Socket.IO
  const market = await prisma.market.findUnique({
    where: { id: marketId },
    select: { name: true },
  });

  await redis.publish(`market:${marketId}`, JSON.stringify({
    event: 'market:result',
    data: {
      marketId,
      market_name: market?.name ?? '',
      result_cycle_id: resultCycle.id,
      open_panna: resultData.open_panna,
      close_panna: resultData.close_panna,
      jodi: resultData.jodi,
      open_ank: resultData.open_ank,
      close_ank: resultData.close_ank,
      declared_at: now.toISOString(),
      cycle_date: today.toISOString(),
    },
  }));

  // Also broadcast to global results channel
  await redis.publish('results:new', JSON.stringify({
    event: 'result:declared',
    data: {
      marketId,
      market_name: market?.name ?? '',
      open_panna: resultData.open_panna,
      close_panna: resultData.close_panna,
      jodi: resultData.jodi,
      open_ank: resultData.open_ank,
      close_ank: resultData.close_ank,
      declared_at: now.toISOString(),
      cycle_date: today.toISOString(),
    },
  }));

  console.log(`[Result] Declared for market=${market?.name} (${marketId}): ${resultData.open_panna}-${resultData.jodi}-${resultData.close_panna}`);

  return {
    result_cycle_id: resultCycle.id,
    enqueued: true,
  };
}

// ---------------------------------------------------------------------------
// allocatePointsToAdmin
// ---------------------------------------------------------------------------

export interface AllocatePointsResult {
  admin_id: string;
  allocated_points: bigint;
  used_points: bigint;
  available_points: bigint;
  allocation_id: string;
}

/**
 * Superadmin allocates points to an admin.
 */
export async function allocatePointsToAdmin(
  adminId: string,
  amount: number,
  note?: string,
): Promise<AllocatePointsResult> {
  if (amount <= 0) throw new AppError('VALIDATION_ERROR');

  const result = await prisma.$transaction(async (tx) => {
    const allocation = await tx.adminPointAllocation.create({
      data: {
        admin_id: adminId,
        amount: BigInt(amount),
        note: note ?? null,
      },
    });

    const admin = await tx.admin.update({
      where: { id: adminId },
      data: { allocated_points: { increment: BigInt(amount) } },
    });

    return { admin, allocation };
  });

  return {
    admin_id: adminId,
    allocated_points: result.admin.allocated_points,
    used_points: result.admin.used_points,
    available_points: result.admin.allocated_points - result.admin.used_points,
    allocation_id: result.allocation.id,
  };
}

// ---------------------------------------------------------------------------
// getAdminPointHistory
// ---------------------------------------------------------------------------

export interface AdminPointAllocationRecord {
  id: string;
  admin_id: string;
  admin_username: string;
  amount: bigint;
  note: string | null;
  created_at: Date;
}

export interface GetAdminPointHistoryResult {
  allocations: AdminPointAllocationRecord[];
}

/**
 * Get all point allocations made to admins.
 */
export async function getAdminPointHistory(adminId?: string): Promise<GetAdminPointHistoryResult> {
  const allocations = await prisma.adminPointAllocation.findMany({
    where: adminId ? { admin_id: adminId } : undefined,
    include: { admin: { select: { username: true } } },
    orderBy: { created_at: 'desc' },
  });

  return {
    allocations: allocations.map((a) => ({
      id: a.id,
      admin_id: a.admin_id,
      admin_username: a.admin.username,
      amount: a.amount,
      note: a.note,
      created_at: a.created_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// getAdminBalances
// ---------------------------------------------------------------------------

export interface AdminBalanceRecord {
  id: string;
  username: string;
  allocated_points: bigint;
  used_points: bigint;
  available_points: bigint;
}

export interface GetAdminBalancesResult {
  admins: AdminBalanceRecord[];
}

/**
 * Get all admins with their point balances.
 */
export async function getAdminBalances(): Promise<GetAdminBalancesResult> {
  const admins = await prisma.admin.findMany({
    select: {
      id: true,
      username: true,
      allocated_points: true,
      used_points: true,
    },
    orderBy: { created_at: 'asc' },
  });

  return {
    admins: admins.map((a) => ({
      id: a.id,
      username: a.username,
      allocated_points: a.allocated_points,
      used_points: a.used_points,
      available_points: a.allocated_points - a.used_points,
    })),
  };
}
