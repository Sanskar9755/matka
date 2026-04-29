/**
 * Wallet service.
 *
 * Handles balance queries, deposit requests, withdrawal requests,
 * and transaction history.
 */

import prisma from '../../lib/prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { TransactionType, TransactionStatus } from '@matka/types';
import type { Transaction } from '@matka/types';

// ---------------------------------------------------------------------------
// getBalance
// ---------------------------------------------------------------------------

export interface BalanceResult {
  balance_points: bigint;
  held_points: bigint;
  available_points: bigint;
}

/**
 * Get the current wallet balance for a user.
 * Returns balance_points, held_points, and available_points (balance - held).
 */
export async function getBalance(userId: string): Promise<BalanceResult> {
  const wallet = await prisma.wallet.findUnique({
    where: { user_id: userId },
  });

  if (!wallet) {
    // Return zero balances if wallet doesn't exist (shouldn't happen in normal flow)
    return {
      balance_points: BigInt(0),
      held_points: BigInt(0),
      available_points: BigInt(0),
    };
  }

  return {
    balance_points: wallet.balance_points,
    held_points: wallet.held_points,
    available_points: wallet.balance_points - wallet.held_points,
  };
}

// ---------------------------------------------------------------------------
// submitDeposit
// ---------------------------------------------------------------------------

export interface SubmitDepositResult {
  transaction: Transaction;
}

/**
 * Submit a deposit request.
 *
 * - Validates amountPoints > 0
 * - Creates a pending Transaction of type 'deposit'
 * - balance_after is set to current balance (not changed yet — pending approval)
 */
export async function submitDeposit(
  userId: string,
  upiRef: string,
  amountPoints: number,
): Promise<SubmitDepositResult> {
  if (amountPoints <= 0) {
    throw new AppError('WITHDRAWAL_EXCEEDS_BALANCE'); // reuse closest error; deposit amount must be positive
  }

  // Get current balance for balance_after (balance doesn't change until approved)
  const wallet = await prisma.wallet.findUnique({
    where: { user_id: userId },
  });

  const currentBalance = wallet?.balance_points ?? BigInt(0);

  const transaction = await prisma.transaction.create({
    data: {
      user_id: userId,
      type: TransactionType.Deposit,
      amount_points: BigInt(amountPoints),
      balance_after: currentBalance, // pending — balance not changed yet
      status: TransactionStatus.Pending,
      upi_ref: upiRef,
    },
  });

  return {
    transaction: {
      id: transaction.id,
      user_id: transaction.user_id,
      type: transaction.type as TransactionType,
      amount_points: transaction.amount_points,
      balance_after: transaction.balance_after,
      status: transaction.status as TransactionStatus,
      upi_ref: transaction.upi_ref,
      approved_by: transaction.approved_by,
      created_at: transaction.created_at,
    },
  };
}

// ---------------------------------------------------------------------------
// submitWithdrawal
// ---------------------------------------------------------------------------

export interface SubmitWithdrawalResult {
  transaction: Transaction;
}

/**
 * Submit a withdrawal request.
 *
 * - Validates available balance (balance_points - held_points) >= amountPoints
 * - Atomically: creates pending Transaction + increments held_points
 */
export async function submitWithdrawal(
  userId: string,
  amountPoints: number,
): Promise<SubmitWithdrawalResult> {
  const wallet = await prisma.wallet.findUnique({
    where: { user_id: userId },
  });

  if (!wallet) {
    throw new AppError('WITHDRAWAL_EXCEEDS_BALANCE');
  }

  const availablePoints = wallet.balance_points - wallet.held_points;

  if (BigInt(amountPoints) > availablePoints) {
    throw new AppError('WITHDRAWAL_EXCEEDS_BALANCE');
  }

  // Atomically create transaction and increment held_points
  const transaction = await prisma.$transaction(async (tx) => {
    const newTransaction = await tx.transaction.create({
      data: {
        user_id: userId,
        type: TransactionType.Withdrawal,
        amount_points: BigInt(amountPoints),
        balance_after: wallet.balance_points, // balance not changed yet — pending approval
        status: TransactionStatus.Pending,
      },
    });

    await tx.wallet.update({
      where: { user_id: userId },
      data: {
        held_points: { increment: BigInt(amountPoints) },
      },
    });

    return newTransaction;
  });

  return {
    transaction: {
      id: transaction.id,
      user_id: transaction.user_id,
      type: transaction.type as TransactionType,
      amount_points: transaction.amount_points,
      balance_after: transaction.balance_after,
      status: transaction.status as TransactionStatus,
      upi_ref: transaction.upi_ref,
      approved_by: transaction.approved_by,
      created_at: transaction.created_at,
    },
  };
}

// ---------------------------------------------------------------------------
// getTransactionHistory
// ---------------------------------------------------------------------------

export interface GetTransactionHistoryResult {
  transactions: Transaction[];
}

/**
 * Get all transactions for a user, ordered by created_at descending.
 */
export async function getTransactionHistory(userId: string): Promise<GetTransactionHistoryResult> {
  const transactions = await prisma.transaction.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
  });

  return {
    transactions: transactions.map((t) => ({
      id: t.id,
      user_id: t.user_id,
      type: t.type as TransactionType,
      amount_points: t.amount_points,
      balance_after: t.balance_after,
      status: t.status as TransactionStatus,
      upi_ref: t.upi_ref,
      approved_by: t.approved_by,
      created_at: t.created_at,
    })),
  };
}
