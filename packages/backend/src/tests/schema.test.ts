/**
 * Schema structure validation tests for the Matka Game Platform.
 *
 * These tests parse the schema.prisma file and verify that all required
 * models, enums, fields, relations, and indexes are present — without
 * requiring a live database connection.
 *
 * Requirements: 12.1, 12.2, 12.3
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, '../../prisma/schema.prisma');

let schemaContent: string;

beforeAll(() => {
  schemaContent = readFileSync(SCHEMA_PATH, 'utf-8');
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Extract the body of a named Prisma block (model or enum).
 * Returns null if the block is not found.
 */
function extractBlock(type: 'model' | 'enum', name: string): string | null {
  // Match "model Foo {" or "enum Foo {" and capture everything until the closing "}"
  const regex = new RegExp(`${type}\\s+${name}\\s*\\{([^}]*)\\}`, 's');
  const match = schemaContent.match(regex);
  return match ? match[1] : null;
}

function blockHasField(block: string, fieldName: string): boolean {
  // Each field starts at the beginning of a line (after optional whitespace)
  return new RegExp(`^\\s+${fieldName}\\s`, 'm').test(block);
}

// ---------------------------------------------------------------------------
// Enum tests
// ---------------------------------------------------------------------------

describe('Enums', () => {
  const expectedEnums: Record<string, string[]> = {
    Role: ['user', 'admin', 'superadmin'],
    BetType: ['single', 'jodi', 'single_panna', 'double_panna', 'triple_panna', 'half_sangam', 'full_sangam'],
    TransactionType: ['deposit', 'withdrawal', 'bet_deduction', 'winning_credit'],
    TransactionStatus: ['pending', 'approved', 'rejected', 'completed'],
    MarketStatus: ['open', 'locked', 'closed'],
    BetOutcome: ['pending', 'win', 'loss'],
  };

  for (const [enumName, values] of Object.entries(expectedEnums)) {
    describe(enumName, () => {
      it('is defined in the schema', () => {
        const block = extractBlock('enum', enumName);
        expect(block, `enum ${enumName} not found`).not.toBeNull();
      });

      for (const value of values) {
        it(`contains value "${value}"`, () => {
          const block = extractBlock('enum', enumName)!;
          expect(block).toMatch(new RegExp(`^\\s*${value}\\s*$`, 'm'));
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Model: User
// ---------------------------------------------------------------------------

describe('Model: User', () => {
  let block: string | null;

  beforeAll(() => {
    block = extractBlock('model', 'User');
  });

  it('is defined in the schema', () => {
    expect(block).not.toBeNull();
  });

  const requiredFields = [
    'id', 'username', 'password_hash', 'role', 'admin_id', 'is_active', 'created_at',
  ];

  for (const field of requiredFields) {
    it(`has field "${field}"`, () => {
      expect(blockHasField(block!, field)).toBe(true);
    });
  }

  it('has @unique on username', () => {
    expect(block).toMatch(/username\s+String\s+@unique/);
  });

  it('has @default(user) on role', () => {
    expect(block).toMatch(/role\s+Role\s+@default\(user\)/);
  });

  it('has @default(true) on is_active', () => {
    expect(block).toMatch(/is_active\s+Boolean\s+@default\(true\)/);
  });

  it('maps to "users" table', () => {
    expect(block).toMatch(/@@map\("users"\)/);
  });
});

// ---------------------------------------------------------------------------
// Model: Admin
// ---------------------------------------------------------------------------

describe('Model: Admin', () => {
  let block: string | null;

  beforeAll(() => {
    block = extractBlock('model', 'Admin');
  });

  it('is defined in the schema', () => {
    expect(block).not.toBeNull();
  });

  const requiredFields = [
    'id', 'username', 'password_hash', 'referral_code', 'is_active',
    'min_bet_points', 'max_bet_points', 'created_at',
  ];

  for (const field of requiredFields) {
    it(`has field "${field}"`, () => {
      expect(blockHasField(block!, field)).toBe(true);
    });
  }

  it('has @unique on username', () => {
    expect(block).toMatch(/username\s+String\s+@unique/);
  });

  it('has @unique on referral_code', () => {
    expect(block).toMatch(/referral_code\s+String\s+@unique/);
  });

  it('has @default(10) on min_bet_points', () => {
    expect(block).toMatch(/min_bet_points\s+Int\s+@default\(10\)/);
  });

  it('has @default(10000) on max_bet_points', () => {
    expect(block).toMatch(/max_bet_points\s+Int\s+@default\(10000\)/);
  });

  it('maps to "admins" table', () => {
    expect(block).toMatch(/@@map\("admins"\)/);
  });
});

// ---------------------------------------------------------------------------
// Model: Wallet
// ---------------------------------------------------------------------------

describe('Model: Wallet', () => {
  let block: string | null;

  beforeAll(() => {
    block = extractBlock('model', 'Wallet');
  });

  it('is defined in the schema', () => {
    expect(block).not.toBeNull();
  });

  const requiredFields = ['id', 'user_id', 'balance_points', 'held_points', 'updated_at'];

  for (const field of requiredFields) {
    it(`has field "${field}"`, () => {
      expect(blockHasField(block!, field)).toBe(true);
    });
  }

  it('has @unique on user_id (one wallet per user)', () => {
    expect(block).toMatch(/user_id\s+String\s+@unique/);
  });

  it('has BigInt type for balance_points', () => {
    expect(block).toMatch(/balance_points\s+BigInt/);
  });

  it('has BigInt type for held_points', () => {
    expect(block).toMatch(/held_points\s+BigInt/);
  });

  it('maps to "wallets" table', () => {
    expect(block).toMatch(/@@map\("wallets"\)/);
  });
});

// ---------------------------------------------------------------------------
// Model: Transaction
// ---------------------------------------------------------------------------

describe('Model: Transaction', () => {
  let block: string | null;

  beforeAll(() => {
    block = extractBlock('model', 'Transaction');
  });

  it('is defined in the schema', () => {
    expect(block).not.toBeNull();
  });

  const requiredFields = [
    'id', 'user_id', 'type', 'amount_points', 'balance_after',
    'status', 'upi_ref', 'approved_by', 'created_at',
  ];

  for (const field of requiredFields) {
    it(`has field "${field}"`, () => {
      expect(blockHasField(block!, field)).toBe(true);
    });
  }

  it('has nullable upi_ref', () => {
    expect(block).toMatch(/upi_ref\s+String\?/);
  });

  it('has nullable approved_by', () => {
    expect(block).toMatch(/approved_by\s+String\?/);
  });

  it('has @default(pending) on status', () => {
    expect(block).toMatch(/status\s+TransactionStatus\s+@default\(pending\)/);
  });

  it('has idx_transactions_user_id index', () => {
    expect(block).toMatch(/@@index\(\[user_id\]/);
  });

  it('has idx_transactions_status index', () => {
    expect(block).toMatch(/@@index\(\[status\]/);
  });

  it('maps to "transactions" table', () => {
    expect(block).toMatch(/@@map\("transactions"\)/);
  });
});

// ---------------------------------------------------------------------------
// Model: Market
// ---------------------------------------------------------------------------

describe('Model: Market', () => {
  let block: string | null;

  beforeAll(() => {
    block = extractBlock('model', 'Market');
  });

  it('is defined in the schema', () => {
    expect(block).not.toBeNull();
  });

  const requiredFields = [
    'id', 'name', 'open_time', 'close_time', 'result_time',
    'status', 'is_active', 'updated_at',
  ];

  for (const field of requiredFields) {
    it(`has field "${field}"`, () => {
      expect(blockHasField(block!, field)).toBe(true);
    });
  }

  it('has @unique on name', () => {
    expect(block).toMatch(/name\s+String\s+@unique/);
  });

  it('has @default(open) on status', () => {
    expect(block).toMatch(/status\s+MarketStatus\s+@default\(open\)/);
  });

  it('has idx_markets_status index', () => {
    expect(block).toMatch(/@@index\(\[status\]/);
  });

  it('maps to "markets" table', () => {
    expect(block).toMatch(/@@map\("markets"\)/);
  });
});

// ---------------------------------------------------------------------------
// Model: Bet
// ---------------------------------------------------------------------------

describe('Model: Bet', () => {
  let block: string | null;

  beforeAll(() => {
    block = extractBlock('model', 'Bet');
  });

  it('is defined in the schema', () => {
    expect(block).not.toBeNull();
  });

  const requiredFields = [
    'id', 'user_id', 'market_id', 'result_cycle_id', 'bet_type',
    'selection', 'points', 'outcome', 'winning_amount', 'placed_at',
  ];

  for (const field of requiredFields) {
    it(`has field "${field}"`, () => {
      expect(blockHasField(block!, field)).toBe(true);
    });
  }

  it('has BigInt type for points', () => {
    expect(block).toMatch(/points\s+BigInt/);
  });

  it('has @default(pending) on outcome', () => {
    expect(block).toMatch(/outcome\s+BetOutcome\s+@default\(pending\)/);
  });

  it('has @default(0) on winning_amount', () => {
    expect(block).toMatch(/winning_amount\s+BigInt\s+@default\(0\)/);
  });

  it('has idx_bets_user_id index', () => {
    expect(block).toMatch(/@@index\(\[user_id\]/);
  });

  it('has idx_bets_market_id_cycle composite index', () => {
    expect(block).toMatch(/@@index\(\[market_id,\s*result_cycle_id\]/);
  });

  it('has idx_bets_outcome index', () => {
    expect(block).toMatch(/@@index\(\[outcome\]/);
  });

  it('maps to "bets" table', () => {
    expect(block).toMatch(/@@map\("bets"\)/);
  });
});

// ---------------------------------------------------------------------------
// Model: ResultCycle
// ---------------------------------------------------------------------------

describe('Model: ResultCycle', () => {
  let block: string | null;

  beforeAll(() => {
    block = extractBlock('model', 'ResultCycle');
  });

  it('is defined in the schema', () => {
    expect(block).not.toBeNull();
  });

  const requiredFields = [
    'id', 'market_id', 'cycle_date', 'open_panna', 'close_panna',
    'jodi', 'open_ank', 'close_ank', 'calculation_done', 'declared_at',
  ];

  for (const field of requiredFields) {
    it(`has field "${field}"`, () => {
      expect(blockHasField(block!, field)).toBe(true);
    });
  }

  it('has @default(false) on calculation_done', () => {
    expect(block).toMatch(/calculation_done\s+Boolean\s+@default\(false\)/);
  });

  it('has unique constraint on (market_id, cycle_date)', () => {
    expect(block).toMatch(/@@unique\(\[market_id,\s*cycle_date\]/);
  });

  it('maps to "result_cycles" table', () => {
    expect(block).toMatch(/@@map\("result_cycles"\)/);
  });
});

// ---------------------------------------------------------------------------
// Model: PlatformConfig
// ---------------------------------------------------------------------------

describe('Model: PlatformConfig', () => {
  let block: string | null;

  beforeAll(() => {
    block = extractBlock('model', 'PlatformConfig');
  });

  it('is defined in the schema', () => {
    expect(block).not.toBeNull();
  });

  const requiredFields = [
    'id', 'winning_multipliers', 'result_api_endpoint',
    'result_poll_interval_sec', 'upi_details', 'feature_flags', 'updated_at',
  ];

  for (const field of requiredFields) {
    it(`has field "${field}"`, () => {
      expect(blockHasField(block!, field)).toBe(true);
    });
  }

  it('has Json type for winning_multipliers', () => {
    expect(block).toMatch(/winning_multipliers\s+Json/);
  });

  it('has Json type for feature_flags', () => {
    expect(block).toMatch(/feature_flags\s+Json/);
  });

  it('has @default(300) on result_poll_interval_sec', () => {
    expect(block).toMatch(/result_poll_interval_sec\s+Int\s+@default\(300\)/);
  });

  it('maps to "platform_config" table', () => {
    expect(block).toMatch(/@@map\("platform_config"\)/);
  });
});

// ---------------------------------------------------------------------------
// Overall schema structure
// ---------------------------------------------------------------------------

describe('Schema structure', () => {
  it('declares a postgresql datasource', () => {
    expect(schemaContent).toMatch(/provider\s*=\s*"postgresql"/);
  });

  it('declares a prisma-client-js generator', () => {
    expect(schemaContent).toMatch(/provider\s*=\s*"prisma-client-js"/);
  });

  const expectedModels = [
    'User', 'Admin', 'Wallet', 'Transaction', 'Market',
    'Bet', 'ResultCycle', 'PlatformConfig',
  ];

  for (const modelName of expectedModels) {
    it(`defines model ${modelName}`, () => {
      expect(extractBlock('model', modelName)).not.toBeNull();
    });
  }

  const expectedEnums = [
    'Role', 'BetType', 'TransactionType', 'TransactionStatus', 'MarketStatus', 'BetOutcome',
  ];

  for (const enumName of expectedEnums) {
    it(`defines enum ${enumName}`, () => {
      expect(extractBlock('enum', enumName)).not.toBeNull();
    });
  }
});
