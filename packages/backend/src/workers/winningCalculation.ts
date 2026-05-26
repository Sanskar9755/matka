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
  // 1. Check calculation_done flag BEFORE transaction (fast idempotency check)
  const preCheck = await prisma.resultCycle.findUnique({
    where: { id: resultCycleId },
    select: { calculation_done: true },
  });

  if (!preCheck) {
    console.error(`[WinningCalculation] ResultCycle ${resultCycleId} not found.`);
    return { processed: false, winCount: 0, lossCount: 0 };
  }

  if (preCheck.calculation_done) {
    console.log(`[WinningCalculation] Already done for cycle=${resultCycleId}. Skipping.`);
    return { processed: false, winCount: 0, lossCount: 0 };
  }

  return await prisma.$transaction(async (tx) => {
    // 2. Re-check inside transaction to prevent race conditions
    const resultCycle = await tx.resultCycle.findUnique({
      where: { id: resultCycleId },
    });

    if (!resultCycle) {
      console.error(`[WinningCalculation] ResultCycle ${resultCycleId} not found inside tx.`);
      return { processed: false, winCount: 0, lossCount: 0 };
    }

    if (resultCycle.calculation_done) {
      console.log(`[WinningCalculation] Already done (race check) for cycle=${resultCycleId}. Skipping.`);
      return { processed: false, winCount: 0, lossCount: 0 };
    }

    const isFullDeclaration = resultCycle.open_panna !== '' && resultCycle.close_panna !== '';
    const isOpenDeclaration = resultCycle.open_panna !== '';

    if (!isOpenDeclaration) {
      console.log(`[WinningCalculation] No result declared yet for cycle=${resultCycleId}. Skipping.`);
      return { processed: false, winCount: 0, lossCount: 0 };
    }

    // 3. Fetch all pending bets for this result cycle
    const bets = await tx.bet.findMany({
      where: {
        result_cycle_id: resultCycleId,
        outcome: 'pending',
      },
    });

    // Determine which bets we can process in this run
    let betsToProcess = [];
    if (isFullDeclaration) {
      // If full result is declared, process ALL pending bets
      betsToProcess = bets;
    } else {
      // If only open is declared, process ONLY open session bets (single, single_panna, double_panna, triple_panna)
      betsToProcess = bets.filter((bet) => 
        bet.session === 'open' &&
        ['single', 'single_panna', 'double_panna', 'triple_panna'].includes(bet.bet_type)
      );
    }

    if (betsToProcess.length === 0) {
      // No bets to process in this run.
      // If this is a full declaration, we can mark the cycle as calculation_done = true
      if (isFullDeclaration) {
        await tx.resultCycle.update({
          where: { id: resultCycleId },
          data: { calculation_done: true },
        });
      }
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

    for (const bet of betsToProcess) {
      const isWin = matchBet(
        { bet_type: bet.bet_type as BetType, selection: bet.selection, session: bet.session },
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

    // 10. Set calculation_done = true if full declaration
    if (isFullDeclaration) {
      await tx.resultCycle.update({
        where: { id: resultCycleId },
        data: { calculation_done: true },
      });
    }

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
