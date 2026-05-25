/**
 * Bet service.
 *
 * Handles bet placement with full validation and atomic wallet deduction,
 * and bet history retrieval.
 */

import prisma from '../../lib/prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { BetType, BetOutcome, MarketStatus } from '@matka/types';
import type { Bet } from '@matka/types';
import { publish } from '../../realtime/pubsub.js';
import { isOpenSessionLocked } from '../markets/markets.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse time string (HH:MM) to minutes since midnight.
 */
function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Get current time in minutes since midnight.
 */
function getCurrentTimeInMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Get today's date as a Date object (midnight local time, date only).
 */
function getTodayDate(): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d;
}

/**
 * Validate selection format per bet type.
 * Returns true if valid, false if invalid.
 */
function validateSelection(betType: BetType, selection: string): boolean {
  switch (betType) {
    case BetType.Single:
      // 1 digit (0-9)
      return /^\d$/.test(selection);

    case BetType.Jodi:
      // 2 digits (00-99)
      return /^\d{2}$/.test(selection);

    case BetType.SinglePanna:
    case BetType.DoublePanna:
    case BetType.TriplePanna:
      // 3 digits
      return /^\d{3}$/.test(selection);

    case BetType.HalfSangam:
      // format "DDD-D" (3 digits dash 1 digit)
      return /^\d{3}-\d$/.test(selection);

    case BetType.FullSangam:
      // format "DDD-DDD" (3 digits dash 3 digits)
      return /^\d{3}-\d{3}$/.test(selection);

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// placeBet
// ---------------------------------------------------------------------------

export interface PlaceBetResult {
  bet: Bet;
}

/**
 * Place a bet for a user on a market.
 *
 * Validates:
 * 1. Market exists and is not locked/closed
 * 2. Time-based lockout (20 min before result_time)
 * 3. Bet limits from admin config
 * 4. Selection format per bet type
 * 5. Wallet balance >= points
 *
 * Atomically deducts wallet balance and creates bet record.
 */
export async function placeBet(
  userId: string,
  marketId: string,
  betType: BetType,
  selection: string,
  points: number,
  session: 'open' | 'close' = 'open',
): Promise<PlaceBetResult> {
  // 1. Get market — if not found → throw MARKET_CLOSED
  const market = await prisma.market.findUnique({
    where: { id: marketId },
  });

  if (!market) {
    throw new AppError('MARKET_CLOSED');
  }

  // 2. Check market status — DB status is authoritative
  if (market.status === MarketStatus.Locked) {
    throw new AppError('MARKET_LOCKED');
  }
  if (market.status === MarketStatus.Closed || !market.is_active) {
    throw new AppError('MARKET_CLOSED');
  }

  // 3. Check open session lock — set by the open-lock BullMQ job or dynamically via time
  if (session === 'open') {
    const isLocked = isOpenSessionLocked({
      open_session_locked: market.open_session_locked,
      open_result_time: market.open_result_time,
      open_time: market.open_time,
    });
    if (isLocked) {
      throw new AppError('MARKET_LOCKED');
    }
  }

  // 4. Get user's admin to check bet limits
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { admin: true },
  });

  if (!user) {
    throw new AppError('UNAUTHORIZED');
  }

  const admin = user.admin;

  // 5. Check minimum bet
  if (points < admin.min_bet_points) {
    throw new AppError('BET_BELOW_MINIMUM');
  }

  // 6. Check maximum bet
  if (points > admin.max_bet_points) {
    throw new AppError('BET_ABOVE_MAXIMUM');
  }

  // 7. Validate selection format
  if (!validateSelection(betType, selection)) {
    throw new AppError('INVALID_SELECTION');
  }

  // 8. Get or create ResultCycle for today's date + marketId
  const todayDate = getTodayDate();

  const resultCycle = await prisma.resultCycle.upsert({
    where: {
      idx_result_cycles_market_date: {
        market_id: marketId,
        cycle_date: todayDate,
      },
    },
    create: {
      market_id: marketId,
      cycle_date: todayDate,
      open_panna: '',
      close_panna: '',
      jodi: '',
      open_ank: '',
      close_ank: '',
      calculation_done: false,
      declared_at: new Date(),
    },
    update: {}, // no update needed if it already exists
  });

  // 9. Check wallet balance >= points
  const wallet = await prisma.wallet.findUnique({
    where: { user_id: userId },
  });

  if (!wallet || wallet.balance_points < BigInt(points)) {
    throw new AppError('INSUFFICIENT_BALANCE');
  }

  // 10. Atomically: deduct wallet balance + create Bet record
  const bet = await prisma.$transaction(async (tx) => {
    // Deduct wallet balance
    await tx.wallet.update({
      where: { user_id: userId },
      data: {
        balance_points: { decrement: BigInt(points) },
      },
    });

    // Create bet record
    const newBet = await tx.bet.create({
      data: {
        user_id: userId,
        market_id: marketId,
        result_cycle_id: resultCycle.id,
        bet_type: betType,
        session,
        selection,
        points: BigInt(points),
        outcome: BetOutcome.Pending,
        winning_amount: BigInt(0),
      },
    });

    return newBet;
  });

  const placedBet: Bet = {
    id: bet.id,
    user_id: bet.user_id,
    market_id: bet.market_id,
    result_cycle_id: bet.result_cycle_id,
    bet_type: bet.bet_type as BetType,
    selection: bet.selection,
    points: bet.points,
    outcome: bet.outcome as BetOutcome,
    winning_amount: bet.winning_amount,
    placed_at: bet.placed_at,
  };

  // -------------------------------------------------------------------------
  // Real-time: publish bet:new and bet:totals to admin channel
  // if the market is within 20 min of result_time (pre-result window).
  // -------------------------------------------------------------------------
  try {
    const nowMinutes = getCurrentTimeInMinutes();
    const resultMins = parseTimeToMinutes(market.result_time);
    const lockoutMins = resultMins - 20;
    const isInPreResultWindow = nowMinutes >= lockoutMins - 20 && nowMinutes < resultMins;

    if (isInPreResultWindow) {
      const adminId = user.admin_id;

      // Compute updated totals for this market's current cycle
      const allBets = await prisma.bet.findMany({
        where: { result_cycle_id: resultCycle.id },
        select: { bet_type: true, points: true },
      });

      const totals: Record<string, number> = {};
      for (const b of allBets) {
        const key = b.bet_type as string;
        totals[key] = (totals[key] ?? 0) + Number(b.points);
      }

      await publish(`admin:${adminId}`, {
        event: 'bet:new',
        data: {
          marketId,
          betId: bet.id,
          userRef: userId,
          betType: bet.bet_type,
          points: Number(bet.points),
        },
      });

      await publish(`admin:${adminId}`, {
        event: 'bet:totals',
        data: { marketId, totals },
      });
    }
  } catch (err) {
    // Real-time publishing is best-effort; do not fail the bet placement
    console.error('[bets.service] Failed to publish real-time events:', err);
  }

  return { bet: placedBet };
}

// ---------------------------------------------------------------------------
// getBetHistory
// ---------------------------------------------------------------------------

export interface BetHistoryItem {
  id: string;
  market_name: string;
  bet_type: BetType;
  session: string;
  selection: string;
  points: bigint;
  outcome: BetOutcome;
  winning_amount: bigint;
  placed_at: Date;
}

export interface GetBetHistoryResult {
  bets: BetHistoryItem[];
}

/**
 * Get all bets for a user with market name, bet type, points, outcome.
 * Ordered by placed_at descending.
 */
export async function getBetHistory(userId: string): Promise<GetBetHistoryResult> {
  const bets = await prisma.bet.findMany({
    where: { user_id: userId },
    include: {
      market: {
        select: { name: true },
      },
    },
    orderBy: { placed_at: 'desc' },
  });

  return {
    bets: bets.map((bet) => ({
      id: bet.id,
      market_name: bet.market.name,
      bet_type: bet.bet_type as BetType,
      session: bet.session,
      selection: bet.selection,
      points: bet.points,
      outcome: bet.outcome as BetOutcome,
      winning_amount: bet.winning_amount,
      placed_at: bet.placed_at,
    })),
  };
}
