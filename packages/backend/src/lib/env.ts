/**
 * Environment variable validation using Zod.
 *
 * Import `env` wherever you need a validated, typed environment variable.
 * The module throws at startup if any required variable is missing or invalid,
 * preventing the server from starting with a broken configuration.
 */

import { z } from 'zod';

const envSchema = z.object({
  /** PostgreSQL connection string */
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),

  /** Redis connection string */
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),

  /** Secret used to sign JWT tokens */
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),

  /** JWT access token expiry (e.g. "15m", "1h") */
  JWT_ACCESS_EXPIRY: z.string().default('15m'),

  /** JWT refresh token expiry (e.g. "7d", "30d") */
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  /** HTTP port the Express server listens on */
  PORT: z
    .string()
    .default('3000')
    .transform((v) => parseInt(v, 10))
    .refine((v) => !isNaN(v) && v > 0 && v < 65536, 'PORT must be a valid port number'),

  /** Runtime environment */
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parsed and validated environment variables.
 * Throws a ZodError at module load time if validation fails.
 */
export const env: Env = envSchema.parse(process.env);

export default env;
