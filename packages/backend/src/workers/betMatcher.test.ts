/**
 * Unit tests for betMatcher.ts
 *
 * Tests all 7 bet types for both win and loss cases.
 */

import { describe, it, expect } from 'vitest';
import { matchBet, getPannaType } from './betMatcher.js';
import { BetType } from '@matka/types';
import type { MatchResult } from './betMatcher.js';

// ---------------------------------------------------------------------------
// Test fixture: a known result
// ---------------------------------------------------------------------------

const RESULT: MatchResult = {
  open_panna: '123', // single panna (all different digits)
  close_panna: '112', // double panna (two same digits)
  jodi: '36',
  open_ank: '3',
  close_ank: '6',
};

// ---------------------------------------------------------------------------
// getPannaType
// ---------------------------------------------------------------------------

describe('getPannaType', () => {
  it('returns "single" when all 3 digits are different', () => {
    expect(getPannaType('123')).toBe('single');
    expect(getPannaType('456')).toBe('single');
    expect(getPannaType('789')).toBe('single');
    expect(getPannaType('012')).toBe('single');
  });

  it('returns "double" when exactly 2 digits are the same', () => {
    expect(getPannaType('112')).toBe('double');
    expect(getPannaType('122')).toBe('double');
    expect(getPannaType('211')).toBe('double');
    expect(getPannaType('223')).toBe('double');
    expect(getPannaType('100')).toBe('double');
  });

  it('returns "triple" when all 3 digits are the same', () => {
    expect(getPannaType('111')).toBe('triple');
    expect(getPannaType('222')).toBe('triple');
    expect(getPannaType('000')).toBe('triple');
    expect(getPannaType('999')).toBe('triple');
  });
});

// ---------------------------------------------------------------------------
// Single bet type
// ---------------------------------------------------------------------------

describe('matchBet - Single', () => {
  it('wins when selection matches open_ank', () => {
    expect(matchBet({ bet_type: BetType.Single, selection: '3' }, RESULT)).toBe(true);
  });

  it('wins when selection matches close_ank', () => {
    expect(matchBet({ bet_type: BetType.Single, selection: '6' }, RESULT)).toBe(true);
  });

  it('loses when selection matches neither ank', () => {
    expect(matchBet({ bet_type: BetType.Single, selection: '5' }, RESULT)).toBe(false);
    expect(matchBet({ bet_type: BetType.Single, selection: '0' }, RESULT)).toBe(false);
    expect(matchBet({ bet_type: BetType.Single, selection: '9' }, RESULT)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Jodi bet type
// ---------------------------------------------------------------------------

describe('matchBet - Jodi', () => {
  it('wins when selection matches jodi', () => {
    expect(matchBet({ bet_type: BetType.Jodi, selection: '36' }, RESULT)).toBe(true);
  });

  it('loses when selection does not match jodi', () => {
    expect(matchBet({ bet_type: BetType.Jodi, selection: '63' }, RESULT)).toBe(false);
    expect(matchBet({ bet_type: BetType.Jodi, selection: '00' }, RESULT)).toBe(false);
    expect(matchBet({ bet_type: BetType.Jodi, selection: '37' }, RESULT)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SinglePanna bet type
// ---------------------------------------------------------------------------

describe('matchBet - SinglePanna', () => {
  it('wins when selection matches open_panna (single panna)', () => {
    // open_panna = '123' which is a single panna (all different)
    expect(matchBet({ bet_type: BetType.SinglePanna, selection: '123' }, RESULT)).toBe(true);
  });

  it('loses when selection matches close_panna but close_panna is not a single panna', () => {
    // close_panna = '112' which is a double panna — should NOT win for SinglePanna
    expect(matchBet({ bet_type: BetType.SinglePanna, selection: '112' }, RESULT)).toBe(false);
  });

  it('loses when selection is a single panna but does not match either panna', () => {
    expect(matchBet({ bet_type: BetType.SinglePanna, selection: '456' }, RESULT)).toBe(false);
  });

  it('loses when selection is a double panna', () => {
    expect(matchBet({ bet_type: BetType.SinglePanna, selection: '223' }, RESULT)).toBe(false);
  });

  it('loses when selection is a triple panna', () => {
    expect(matchBet({ bet_type: BetType.SinglePanna, selection: '111' }, RESULT)).toBe(false);
  });

  it('wins when selection matches close_panna and close_panna is a single panna', () => {
    const result: MatchResult = {
      ...RESULT,
      close_panna: '456', // single panna
    };
    expect(matchBet({ bet_type: BetType.SinglePanna, selection: '456' }, result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DoublePanna bet type
// ---------------------------------------------------------------------------

describe('matchBet - DoublePanna', () => {
  it('wins when selection matches close_panna (double panna)', () => {
    // close_panna = '112' which is a double panna
    expect(matchBet({ bet_type: BetType.DoublePanna, selection: '112' }, RESULT)).toBe(true);
  });

  it('loses when selection matches open_panna but open_panna is not a double panna', () => {
    // open_panna = '123' which is a single panna — should NOT win for DoublePanna
    expect(matchBet({ bet_type: BetType.DoublePanna, selection: '123' }, RESULT)).toBe(false);
  });

  it('loses when selection is a double panna but does not match either panna', () => {
    expect(matchBet({ bet_type: BetType.DoublePanna, selection: '334' }, RESULT)).toBe(false);
  });

  it('loses when selection is a single panna', () => {
    expect(matchBet({ bet_type: BetType.DoublePanna, selection: '456' }, RESULT)).toBe(false);
  });

  it('loses when selection is a triple panna', () => {
    expect(matchBet({ bet_type: BetType.DoublePanna, selection: '111' }, RESULT)).toBe(false);
  });

  it('wins when selection matches open_panna and open_panna is a double panna', () => {
    const result: MatchResult = {
      ...RESULT,
      open_panna: '334', // double panna
    };
    expect(matchBet({ bet_type: BetType.DoublePanna, selection: '334' }, result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TriplePanna bet type
// ---------------------------------------------------------------------------

describe('matchBet - TriplePanna', () => {
  it('wins when selection matches open_panna (triple panna)', () => {
    const result: MatchResult = {
      ...RESULT,
      open_panna: '555',
    };
    expect(matchBet({ bet_type: BetType.TriplePanna, selection: '555' }, result)).toBe(true);
  });

  it('wins when selection matches close_panna (triple panna)', () => {
    const result: MatchResult = {
      ...RESULT,
      close_panna: '000',
    };
    expect(matchBet({ bet_type: BetType.TriplePanna, selection: '000' }, result)).toBe(true);
  });

  it('loses when selection is a triple panna but does not match either panna', () => {
    expect(matchBet({ bet_type: BetType.TriplePanna, selection: '999' }, RESULT)).toBe(false);
  });

  it('loses when selection is a single panna', () => {
    expect(matchBet({ bet_type: BetType.TriplePanna, selection: '123' }, RESULT)).toBe(false);
  });

  it('loses when selection is a double panna', () => {
    expect(matchBet({ bet_type: BetType.TriplePanna, selection: '112' }, RESULT)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HalfSangam bet type
// ---------------------------------------------------------------------------

describe('matchBet - HalfSangam', () => {
  it('wins when panna_part == open_panna AND ank_part == close_ank', () => {
    // open_panna = '123', close_ank = '6'
    expect(matchBet({ bet_type: BetType.HalfSangam, selection: '123-6' }, RESULT)).toBe(true);
  });

  it('wins when panna_part == close_panna AND ank_part == open_ank', () => {
    // close_panna = '112', open_ank = '3'
    expect(matchBet({ bet_type: BetType.HalfSangam, selection: '112-3' }, RESULT)).toBe(true);
  });

  it('loses when panna_part matches but ank_part does not', () => {
    expect(matchBet({ bet_type: BetType.HalfSangam, selection: '123-3' }, RESULT)).toBe(false);
    expect(matchBet({ bet_type: BetType.HalfSangam, selection: '112-6' }, RESULT)).toBe(false);
  });

  it('loses when ank_part matches but panna_part does not', () => {
    expect(matchBet({ bet_type: BetType.HalfSangam, selection: '456-6' }, RESULT)).toBe(false);
    expect(matchBet({ bet_type: BetType.HalfSangam, selection: '789-3' }, RESULT)).toBe(false);
  });

  it('loses when neither part matches', () => {
    expect(matchBet({ bet_type: BetType.HalfSangam, selection: '456-9' }, RESULT)).toBe(false);
  });

  it('loses when selection has no dash', () => {
    expect(matchBet({ bet_type: BetType.HalfSangam, selection: '1236' }, RESULT)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FullSangam bet type
// ---------------------------------------------------------------------------

describe('matchBet - FullSangam', () => {
  it('wins when open_part == open_panna AND close_part == close_panna', () => {
    // open_panna = '123', close_panna = '112'
    expect(matchBet({ bet_type: BetType.FullSangam, selection: '123-112' }, RESULT)).toBe(true);
  });

  it('loses when open_part matches but close_part does not', () => {
    expect(matchBet({ bet_type: BetType.FullSangam, selection: '123-456' }, RESULT)).toBe(false);
  });

  it('loses when close_part matches but open_part does not', () => {
    expect(matchBet({ bet_type: BetType.FullSangam, selection: '456-112' }, RESULT)).toBe(false);
  });

  it('loses when order is reversed', () => {
    // close_panna-open_panna order should NOT win
    expect(matchBet({ bet_type: BetType.FullSangam, selection: '112-123' }, RESULT)).toBe(false);
  });

  it('loses when neither part matches', () => {
    expect(matchBet({ bet_type: BetType.FullSangam, selection: '456-789' }, RESULT)).toBe(false);
  });

  it('loses when selection has no dash', () => {
    expect(matchBet({ bet_type: BetType.FullSangam, selection: '123112' }, RESULT)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('matchBet - edge cases', () => {
  it('returns false for unknown bet type', () => {
    expect(
      matchBet({ bet_type: 'unknown_type' as BetType, selection: '3' }, RESULT),
    ).toBe(false);
  });

  it('handles result with all same open and close panna', () => {
    const result: MatchResult = {
      open_panna: '111',
      close_panna: '222',
      jodi: '12',
      open_ank: '1',
      close_ank: '2',
    };
    expect(matchBet({ bet_type: BetType.TriplePanna, selection: '111' }, result)).toBe(true);
    expect(matchBet({ bet_type: BetType.TriplePanna, selection: '222' }, result)).toBe(true);
    expect(matchBet({ bet_type: BetType.SinglePanna, selection: '111' }, result)).toBe(false);
    expect(matchBet({ bet_type: BetType.DoublePanna, selection: '111' }, result)).toBe(false);
  });
});
