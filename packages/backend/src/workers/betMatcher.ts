/**
 * Bet matching logic.
 *
 * Pure functions for determining whether a bet wins against a declared result.
 * Used by the winning calculation worker.
 */

import { BetType } from '@matka/types';
import type { Bet } from '@matka/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchResult {
  open_panna: string;
  close_panna: string;
  jodi: string;
  open_ank: string;
  close_ank: string;
}

// ---------------------------------------------------------------------------
// getPannaType
// ---------------------------------------------------------------------------

/**
 * Determine the type of a panna (3-digit number) based on its digit composition.
 *
 * - 'triple': all 3 digits are the same (e.g., "111", "555")
 * - 'double': exactly 2 digits are the same (e.g., "112", "223")
 * - 'single': all 3 digits are different (e.g., "123", "456")
 */
export function getPannaType(panna: string): 'single' | 'double' | 'triple' {
  const digits = panna.split('');
  const [a, b, c] = digits;

  if (a === b && b === c) {
    return 'triple';
  }

  if (a === b || b === c || a === c) {
    return 'double';
  }

  return 'single';
}

// ---------------------------------------------------------------------------
// matchBet
// ---------------------------------------------------------------------------

/**
 * Determine whether a bet wins against a declared result.
 *
 * Win conditions by bet type:
 * - Single:       selection == open_ank OR selection == close_ank
 * - Jodi:         selection == jodi
 * - SinglePanna:  selection == open_panna OR selection == close_panna (all 3 digits different)
 * - DoublePanna:  selection == open_panna OR selection == close_panna (exactly 2 same digits)
 * - TriplePanna:  selection == open_panna OR selection == close_panna (all 3 same digits)
 * - HalfSangam:   format "DDD-D" — panna_part == open_panna AND ank_part == close_ank,
 *                 OR panna_part == close_panna AND ank_part == open_ank
 * - FullSangam:   format "DDD-DDD" — open_part == open_panna AND close_part == close_panna
 *
 * @param bet    The bet record (uses bet_type and selection fields)
 * @param result The declared result for the market cycle
 * @returns      true if the bet wins, false otherwise
 */
export function matchBet(
  bet: Pick<Bet, 'bet_type' | 'selection'> & { session?: string },
  result: MatchResult,
): boolean {
  const { bet_type, selection, session } = bet;
  const { open_panna, close_panna, jodi, open_ank, close_ank } = result;

  switch (bet_type) {
    case BetType.Single: {
      if (session === 'open') {
        return selection === open_ank;
      }
      if (session === 'close') {
        return selection === close_ank;
      }
      return selection === open_ank || selection === close_ank;
    }

    case BetType.Jodi: {
      return selection === jodi;
    }

    case BetType.SinglePanna: {
      // Panna must have all 3 different digits
      const pannaType = getPannaType(selection);
      if (pannaType !== 'single') return false;
      if (session === 'open') return selection === open_panna;
      if (session === 'close') return selection === close_panna;
      return selection === open_panna || selection === close_panna;
    }

    case BetType.DoublePanna: {
      // Panna must have exactly 2 same digits
      const pannaType = getPannaType(selection);
      if (pannaType !== 'double') return false;
      if (session === 'open') return selection === open_panna;
      if (session === 'close') return selection === close_panna;
      return selection === open_panna || selection === close_panna;
    }

    case BetType.TriplePanna: {
      // Panna must have all 3 same digits
      const pannaType = getPannaType(selection);
      if (pannaType !== 'triple') return false;
      if (session === 'open') return selection === open_panna;
      if (session === 'close') return selection === close_panna;
      return selection === open_panna || selection === close_panna;
    }

    case BetType.HalfSangam: {
      // Format: "DDD-D" — panna_part-ank_part
      const dashIndex = selection.indexOf('-');
      if (dashIndex === -1) return false;
      const pannaPart = selection.slice(0, dashIndex);
      const ankPart = selection.slice(dashIndex + 1);

      // panna_part == open_panna AND ank_part == close_ank
      // OR panna_part == close_panna AND ank_part == open_ank
      return (
        (pannaPart === open_panna && ankPart === close_ank) ||
        (pannaPart === close_panna && ankPart === open_ank)
      );
    }

    case BetType.FullSangam: {
      // Format: "DDD-DDD" — open_part-close_part
      const dashIndex = selection.indexOf('-');
      if (dashIndex === -1) return false;
      const openPart = selection.slice(0, dashIndex);
      const closePart = selection.slice(dashIndex + 1);

      return openPart === open_panna && closePart === close_panna;
    }

    default:
      return false;
  }
}
