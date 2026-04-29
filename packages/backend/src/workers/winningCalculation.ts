/**
 * Winning Calculation Worker.
 *
 * BullMQ worker for the 'winning-calculation' queue.
 * Processes one market result cycle at a time, crediting winning wallets
 * and marking all bets as win/loss.
 *
 * Idempotency is guaranteed by:
 * 1. A PostgreSQL advisory lock on (marketId, resultCycleId)
 * 2. The `calculation_done` flag on the ResultCycle row
 */

import prisma from '../lib/prisma.js';
import { createWorker, getWinningCalculationQueue, QUEUE_WINNING_CALCULATION } from '../lib/bullmq.js';
import { matchBet } from './betMatcher.js';
import { BetType, TransactionType, TransactionStatus } from '@matka/types';
import type { Job } from 'bullmq';

// ---------------------------------------------------------------------------
// Job data type
// ---------------------------------------------------------------------------

export interface WinningCalculationJobData {
  marketId: string;
  resultCycleId: string;
}

// ---------------------------------------------------------------------------
// Hash helper for advisory lock
// ---------------------------------------------------------------------------

/**
 * Produce a 32-bit integer hash from a string for use as a PostgreSQL
 * advisory lock key. Uses a simple djb2-style hash.
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep as unsigned 32-bit
  }
  // Convert to signed 32-bit integer for pg_try_advisory_xact_lock
  return hash | 0;
}

// ---------------------------------------------------------------------------
// processWinningCalculation
// ---------------------------------------------------------------------------

/**
 * Core logic for winning calculation.
 * Exported for testability.
 */
export async function processWinningCalculation(
  marketId: string,
  resultCycleId: string,
): Promise<{ processed: boolean; winCount: number; lossCount: number }> {
  return await prisma.$transaction(async (tx) => {
    // 1. Acquire PostgreSQL advisory lock
    const lockKey1 = hashString(marketId);
    const lockKey2 = hashString(resultCycleId);

    const lockResult = await tx.$queryRaw<[{ pg_try_advisory_xact_lock: boolean }]>`
      SELECT pg_try_advisory_xact_lock(${lockKey1}::bigint, ${lockKey2}::bigint)
    `;

    const lockAcquired = lockResult[0]?.pg_try_advisory_xact_lock;
    if (!lockAcquired) {
      console.log(
        `[WinningCalculation] Could not acquire advisory lock for market=${marketId}, cycle=${resultCycleId}. Skipping.`,
      );
      return { processed: false, winCount: 0, lossCount: 0 };
    }

    // 2. Check calculation_done flag (idempotency guard)
    const resultCycle = await tx.resultCycle.findUnique({
      where: { id: resultCycleId },
    });

    if (!resultCycle) {
      console.error(`[WinningCalculation] ResultCycle ${resultCycleId} not found.`);
      return { processed: false, winCount: 0, lossCount: 0 };
    }

    if (resultCycle.calculation_done) {
      console.log(
        `[WinningCalculation] Calculation already done for cycle=${resultCycleId}. Skipping (idempotency).`,
      );
      return { processed: false, winCount: 0, lossCount: 0 };
    }

    // 3. Fetch all pending bets for this result cycle
    const bets = await tx.bet.findMany({
      where: {
        result_cycle_id: resultCycleId,
        outcome: 'pending',
      },
    });

    if (bets.length === 0) {
      // No bets to process — still mark as done
      await tx.resultCycle.update({
        where: { id: resultCycleId },
        data: { calculation_done: true },
      });
      return { processed: true, winCount: 0, lossCount: 0 };
    }

    // 4. Fetch PlatformConfig for winning multipliers
    const config = await tx.platformConfig.findFirst();
    if (!config) {
      throw new Error('[WinningCalculation] PlatformConfig not found.');
    }

    const multipliers = config.winning_multipliers as Record<BetType, number>;

    // 5. Build the result object for matchBet
    const matchResult = {
      open_panna: resultCycle.open_panna,
      close_panna: resultCycle.close_panna,
      jodi: resultCycle.jodi,
      open_ank: resultCycle.open_ank,
      close_ank: resultCycle.close_ank,
    };

    // 6. Classify each bet as win or loss
    const winningBets: Array<{ id: string; user_id: string; points: bigint; winning_amount: bigint }> = [];
    const losingBetIds: string[] = [];

    for (const bet of bets) {
      const isWin = matchBet(
        { bet_type: bet.bet_type as BetType, selection: bet.selection },
        matchResult,
      );

      if (isWin) {
        const multiplier = multipliers[bet.bet_type as BetType] ?? 0;
        const winning_amount = bet.points * BigInt(multiplier);
        winningBets.push({
          id: bet.id,
          user_id: bet.user_id,
          points: bet.points,
          winning_amount,
        });
      } else {
        losingBetIds.push(bet.id);
      }
    }

    // 7. Update all winning bets
    if (winningBets.length > 0) {
      for (const wb of winningBets) {
        await tx.bet.update({
          where: { id: wb.id },
          data: {
            outcome: 'win',
            winning_amount: wb.winning_amount,
          },
        });
      }
    }

    // 8. Update all losing bets
    if (losingBetIds.length > 0) {
      await tx.bet.updateMany({
        where: { id: { in: losingBetIds } },
        data: { outcome: 'loss' },
      });
    }

    // 9. Credit winning wallets and create winning_credit transactions
    for (const wb of winningBets) {
      // Get current wallet balance for balance_after
      const wallet = await tx.wallet.findUnique({
        where: { user_id: wb.user_id },
      });

      if (!wallet) {
        console.error(`[WinningCalculation] Wallet not found for user=${wb.user_id}`);
        continue;
      }

      const newBalance = wallet.balance_points + wb.winning_amount;

      // Increment wallet balance
      await tx.wallet.update({
        where: { user_id: wb.user_id },
        data: {
          balance_points: { increment: wb.winning_amount },
        },
      });

      // Create winning_credit transaction record
      await tx.transaction.create({
        data: {
          user_id: wb.user_id,
          type: TransactionType.WinningCredit,
          amount_points: wb.winning_amount,
          balance_after: newBalance,
          status: TransactionStatus.Completed,
        },
      });
    }

    // 10. Set calculation_done = true
    await tx.resultCycle.update({
      where: { id: resultCycleId },
      data: { calculation_done: true },
    });

    console.log(
      `[WinningCalculation] Completed for cycle=${resultCycleId}: ${winningBets.length} wins, ${losingBetIds.length} losses.`,
    );

    return {
      processed: true,
      winCount: winningBets.length,
      lossCount: losingBetIds.length,
    };
  });
}

// ---------------------------------------------------------------------------
// BullMQ Worker
// ---------------------------------------------------------------------------

export const winningCalculationWorker = createWorker<WinningCalculationJobData>(
  QUEUE_WINNING_CALCULATION,
  async (job: Job<WinningCalculationJobData>) => {
    const { marketId, resultCycleId } = job.data;
    console.log(
      `[WinningCalculation] Processing job ${job.id}: market=${marketId}, cycle=${resultCycleId}`,
    );
    return processWinningCalculation(marketId, resultCycleId);
  },
);

// ---------------------------------------------------------------------------
// Enqueue helper
// ---------------------------------------------------------------------------

/**
 * Enqueue a winning-calculation job for a given market result cycle.
 */
export async function enqueueWinningCalculation(
  marketId: string,
  resultCycleId: string,
): Promise<void> {
  const queue = getWinningCalculationQueue();
  await queue.add(
    'calculate',
    { marketId, resultCycleId },
    {
      jobId: `winning-calc:${marketId}:${resultCycleId}`, // deduplication key
    },
  );
}
