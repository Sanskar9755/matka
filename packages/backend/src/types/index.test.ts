import { describe, it, expect } from 'vitest';
import {
  Role,
  BetType,
  TransactionType,
  TransactionStatus,
  MarketStatus,
  BetOutcome,
  DEFAULT_WINNING_MULTIPLIERS,
} from './index.js';

describe('Shared enums', () => {
  it('Role enum has correct values', () => {
    expect(Role.User).toBe('user');
    expect(Role.Admin).toBe('admin');
    expect(Role.SuperAdmin).toBe('superadmin');
  });

  it('BetType enum has all 7 bet types', () => {
    const types = Object.values(BetType);
    expect(types).toHaveLength(7);
    expect(types).toContain('single');
    expect(types).toContain('jodi');
    expect(types).toContain('single_panna');
    expect(types).toContain('double_panna');
    expect(types).toContain('triple_panna');
    expect(types).toContain('half_sangam');
    expect(types).toContain('full_sangam');
  });

  it('TransactionType enum has correct values', () => {
    expect(TransactionType.Deposit).toBe('deposit');
    expect(TransactionType.Withdrawal).toBe('withdrawal');
    expect(TransactionType.BetDeduction).toBe('bet_deduction');
    expect(TransactionType.WinningCredit).toBe('winning_credit');
  });

  it('TransactionStatus enum has correct values', () => {
    expect(TransactionStatus.Pending).toBe('pending');
    expect(TransactionStatus.Approved).toBe('approved');
    expect(TransactionStatus.Rejected).toBe('rejected');
    expect(TransactionStatus.Completed).toBe('completed');
  });

  it('MarketStatus enum has correct values', () => {
    expect(MarketStatus.Open).toBe('open');
    expect(MarketStatus.Locked).toBe('locked');
    expect(MarketStatus.Closed).toBe('closed');
  });

  it('BetOutcome enum has correct values', () => {
    expect(BetOutcome.Pending).toBe('pending');
    expect(BetOutcome.Win).toBe('win');
    expect(BetOutcome.Loss).toBe('loss');
  });
});

describe('DEFAULT_WINNING_MULTIPLIERS', () => {
  it('has an entry for every BetType', () => {
    for (const betType of Object.values(BetType)) {
      expect(DEFAULT_WINNING_MULTIPLIERS).toHaveProperty(betType);
      expect(DEFAULT_WINNING_MULTIPLIERS[betType]).toBeGreaterThan(0);
    }
  });

  it('has the correct default multiplier values', () => {
    expect(DEFAULT_WINNING_MULTIPLIERS[BetType.Single]).toBe(9);
    expect(DEFAULT_WINNING_MULTIPLIERS[BetType.Jodi]).toBe(90);
    expect(DEFAULT_WINNING_MULTIPLIERS[BetType.SinglePanna]).toBe(150);
    expect(DEFAULT_WINNING_MULTIPLIERS[BetType.DoublePanna]).toBe(300);
    expect(DEFAULT_WINNING_MULTIPLIERS[BetType.TriplePanna]).toBe(600);
    expect(DEFAULT_WINNING_MULTIPLIERS[BetType.HalfSangam]).toBe(1000);
    expect(DEFAULT_WINNING_MULTIPLIERS[BetType.FullSangam]).toBe(10000);
  });

  it('multipliers are in ascending order of rarity', () => {
    const { Single, Jodi, SinglePanna, DoublePanna, TriplePanna, HalfSangam, FullSangam } = BetType;
    expect(DEFAULT_WINNING_MULTIPLIERS[Single]).toBeLessThan(DEFAULT_WINNING_MULTIPLIERS[Jodi]);
    expect(DEFAULT_WINNING_MULTIPLIERS[Jodi]).toBeLessThan(DEFAULT_WINNING_MULTIPLIERS[SinglePanna]);
    expect(DEFAULT_WINNING_MULTIPLIERS[SinglePanna]).toBeLessThan(DEFAULT_WINNING_MULTIPLIERS[DoublePanna]);
    expect(DEFAULT_WINNING_MULTIPLIERS[DoublePanna]).toBeLessThan(DEFAULT_WINNING_MULTIPLIERS[TriplePanna]);
    expect(DEFAULT_WINNING_MULTIPLIERS[TriplePanna]).toBeLessThan(DEFAULT_WINNING_MULTIPLIERS[HalfSangam]);
    expect(DEFAULT_WINNING_MULTIPLIERS[HalfSangam]).toBeLessThan(DEFAULT_WINNING_MULTIPLIERS[FullSangam]);
  });
});
