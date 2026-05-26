/**
 * Shared TypeScript enums and interfaces for the Matka Game Platform.
 * This file is the single source of truth for all domain types used
 * across backend services, workers, and (via path alias) the frontend.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** User roles for RBAC enforcement */
export enum Role {
  User = 'user',
  Admin = 'admin',
  SuperAdmin = 'superadmin',
}

/** All supported Matka bet types */
export enum BetType {
  Single = 'single',
  Jodi = 'jodi',
  SinglePanna = 'single_panna',
  DoublePanna = 'double_panna',
  TriplePanna = 'triple_panna',
  HalfSangam = 'half_sangam',
  FullSangam = 'full_sangam',
}

/** Types of wallet transactions */
export enum TransactionType {
  Deposit = 'deposit',
  Withdrawal = 'withdrawal',
  BetDeduction = 'bet_deduction',
  WinningCredit = 'winning_credit',
}

/** Lifecycle states of a transaction */
export enum TransactionStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
  Completed = 'completed',
}

/** Computed / stored status of a market */
export enum MarketStatus {
  Open = 'open',
  Locked = 'locked',
  Closed = 'closed',
}

/** Outcome of a placed bet */
export enum BetOutcome {
  Pending = 'pending',
  Win = 'win',
  Loss = 'loss',
}

// ---------------------------------------------------------------------------
// Entity Interfaces
// ---------------------------------------------------------------------------

/** Registered player account */
export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: Role.User;
  /** The Admin who owns the referral code used at registration — immutable after creation */
  admin_id: string;
  is_active: boolean;
  created_at: Date;
}

/** Game operator account created by SuperAdmin */
export interface Admin {
  id: string;
  username: string;
  password_hash: string;
  /** Unique referral code used to generate the Admin's referral link */
  referral_code: string;
  is_active: boolean;
  /** Minimum bet points allowed for users under this admin */
  min_bet_points: number;
  /** Maximum bet points allowed for users under this admin */
  max_bet_points: number;
  created_at: Date;
}

/** In-platform wallet for a User */
export interface Wallet {
  id: string;
  user_id: string;
  /** Total points balance (includes held points) */
  balance_points: bigint;
  /** Points reserved for pending withdrawal requests */
  held_points: bigint;
  updated_at: Date;
}

/** Immutable record of every wallet change */
export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount_points: bigint;
  /** Wallet balance after this transaction was applied */
  balance_after: bigint;
  status: TransactionStatus;
  /** UPI transaction reference (for deposits) */
  upi_ref: string | null;
  /** Admin who approved/rejected this transaction */
  approved_by: string | null;
  created_at: Date;
}

/** A named Matka game market with fixed schedule */
export interface Market {
  id: string;
  name: string;
  /** Daily open time (HH:MM) */
  open_time: string;
  /** Daily close time (HH:MM) */
  close_time: string;
  /** Daily result declaration time (HH:MM) */
  result_time: string;
  status: MarketStatus;
  is_active: boolean;
  updated_at: Date;
}

/**
 * A wager placed by a User on a Market.
 * All fields except `outcome` and `winning_amount` are immutable after creation.
 */
export interface Bet {
  id: string;
  user_id: string;
  market_id: string;
  result_cycle_id: string;
  bet_type: BetType;
  session: string;
  /**
   * Encoded selection string. Format by bet type:
   * - Single:       "5"       (digit 0–9)
   * - Jodi:         "56"      (two-digit 00–99)
   * - Single/Double/Triple Panna: "123" (three-digit panna)
   * - Half Sangam:  "123-5"   (panna + single ank)
   * - Full Sangam:  "123-456" (open panna + close panna)
   */
  selection: string;
  points: bigint;
  outcome: BetOutcome;
  winning_amount: bigint;
  placed_at: Date;
}

/** Declared result for one market on one calendar day */
export interface ResultCycle {
  id: string;
  market_id: string;
  cycle_date: Date;
  open_panna: string;
  close_panna: string;
  /** Two-digit jodi (open_ank + close_ank) */
  jodi: string;
  /** Single digit derived from open_panna */
  open_ank: string;
  /** Single digit derived from close_panna */
  close_ank: string;
  /** Set to true once winning calculation has been committed — idempotency guard */
  calculation_done: boolean;
  declared_at: Date;
}

/** Platform-wide configuration managed by SuperAdmin */
export interface PlatformConfig {
  id: string;
  /**
   * Payout multipliers keyed by BetType.
   * Example: { single: 9, jodi: 90, single_panna: 150, ... }
   */
  winning_multipliers: Record<BetType, number>;
  /** URL of the external Result API */
  result_api_endpoint: string;
  /** How often (in seconds) to poll the Result API */
  result_poll_interval_sec: number;
  /** UPI payment details shown to users for deposits */
  upi_details: string;
  /** Feature toggles (e.g. { manual_result_entry: true }) */
  feature_flags: Record<string, boolean>;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// JWT Payload
// ---------------------------------------------------------------------------

/** Claims embedded in the JWT access token */
export interface JwtPayload {
  userId: string;
  role: Role;
  /** Present for Role.User; the admin who manages this user */
  adminId?: string;
}

// ---------------------------------------------------------------------------
// API Response Envelope
// ---------------------------------------------------------------------------

/** Standard success response wrapper */
export interface ApiResponse<T> {
  data: T;
}

/** Standard error response wrapper */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Default winning multipliers (used in seed script)
// ---------------------------------------------------------------------------

export const DEFAULT_WINNING_MULTIPLIERS: Record<BetType, number> = {
  [BetType.Single]: 9,
  [BetType.Jodi]: 90,
  [BetType.SinglePanna]: 150,
  [BetType.DoublePanna]: 300,
  [BetType.TriplePanna]: 600,
  [BetType.HalfSangam]: 1000,
  [BetType.FullSangam]: 10000,
};
