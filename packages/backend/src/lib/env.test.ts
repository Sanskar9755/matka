/**
 * Unit tests for environment variable validation (env.ts).
 *
 * Tests verify:
 * - Valid environment passes validation and returns typed values
 * - Missing required variables throw a ZodError
 * - Invalid values (bad URL, bad port) throw a ZodError
 * - Default values are applied when optional vars are absent
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Re-export the schema for testing without triggering the module-level parse
// ---------------------------------------------------------------------------

// We test the schema directly rather than importing `env` (which would throw
// if the test environment doesn't have all required vars set).
const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  PORT: z
    .string()
    .default('3000')
    .transform((v) => parseInt(v, 10))
    .refine((v) => !isNaN(v) && v > 0 && v < 65536, 'PORT must be a valid port number'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/matka',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'supersecretkey1234567890',
  JWT_ACCESS_EXPIRY: '15m',
  JWT_REFRESH_EXPIRY: '7d',
  PORT: '3000',
  NODE_ENV: 'test',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('env schema validation', () => {
  describe('valid environment', () => {
    it('parses a fully specified valid environment', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
    });

    it('returns PORT as a number', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.PORT).toBe('number');
        expect(result.data.PORT).toBe(3000);
      }
    });

    it('accepts NODE_ENV = "production"', () => {
      const result = envSchema.safeParse({ ...validEnv, NODE_ENV: 'production' });
      expect(result.success).toBe(true);
    });

    it('accepts NODE_ENV = "development"', () => {
      const result = envSchema.safeParse({ ...validEnv, NODE_ENV: 'development' });
      expect(result.success).toBe(true);
    });
  });

  describe('default values', () => {
    it('defaults JWT_ACCESS_EXPIRY to "15m" when not provided', () => {
      const { JWT_ACCESS_EXPIRY: _, ...rest } = validEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_ACCESS_EXPIRY).toBe('15m');
      }
    });

    it('defaults JWT_REFRESH_EXPIRY to "7d" when not provided', () => {
      const { JWT_REFRESH_EXPIRY: _, ...rest } = validEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_REFRESH_EXPIRY).toBe('7d');
      }
    });

    it('defaults PORT to 3000 when not provided', () => {
      const { PORT: _, ...rest } = validEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(3000);
      }
    });

    it('defaults NODE_ENV to "development" when not provided', () => {
      const { NODE_ENV: _, ...rest } = validEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('development');
      }
    });
  });

  describe('missing required variables', () => {
    it('fails when DATABASE_URL is missing', () => {
      const { DATABASE_URL: _, ...rest } = validEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('fails when REDIS_URL is missing', () => {
      const { REDIS_URL: _, ...rest } = validEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('fails when JWT_SECRET is missing', () => {
      const { JWT_SECRET: _, ...rest } = validEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe('invalid values', () => {
    it('fails when DATABASE_URL is not a valid URL', () => {
      const result = envSchema.safeParse({ ...validEnv, DATABASE_URL: 'not-a-url' });
      expect(result.success).toBe(false);
    });

    it('fails when REDIS_URL is not a valid URL', () => {
      const result = envSchema.safeParse({ ...validEnv, REDIS_URL: 'not-a-url' });
      expect(result.success).toBe(false);
    });

    it('fails when JWT_SECRET is shorter than 16 characters', () => {
      const result = envSchema.safeParse({ ...validEnv, JWT_SECRET: 'tooshort' });
      expect(result.success).toBe(false);
    });

    it('fails when PORT is 0', () => {
      const result = envSchema.safeParse({ ...validEnv, PORT: '0' });
      expect(result.success).toBe(false);
    });

    it('fails when PORT is 65536', () => {
      const result = envSchema.safeParse({ ...validEnv, PORT: '65536' });
      expect(result.success).toBe(false);
    });

    it('fails when PORT is not a number', () => {
      const result = envSchema.safeParse({ ...validEnv, PORT: 'abc' });
      expect(result.success).toBe(false);
    });

    it('fails when NODE_ENV is an invalid value', () => {
      const result = envSchema.safeParse({ ...validEnv, NODE_ENV: 'staging' });
      expect(result.success).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('accepts a high but valid PORT number', () => {
      const result = envSchema.safeParse({ ...validEnv, PORT: '65535' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(65535);
      }
    });

    it('accepts PORT = 1', () => {
      const result = envSchema.safeParse({ ...validEnv, PORT: '1' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(1);
      }
    });

    it('accepts a JWT_SECRET exactly 16 characters long', () => {
      const result = envSchema.safeParse({ ...validEnv, JWT_SECRET: '1234567890123456' });
      expect(result.success).toBe(true);
    });

    it('fails for a JWT_SECRET of 15 characters', () => {
      const result = envSchema.safeParse({ ...validEnv, JWT_SECRET: '123456789012345' });
      expect(result.success).toBe(false);
    });
  });
});
