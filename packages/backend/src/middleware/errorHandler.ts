/**
 * Global Express error handler middleware.
 *
 * Returns a standard error envelope:
 * {
 *   error: {
 *     code: string,
 *     message: string,
 *     details?: Record<string, unknown>
 *   }
 * }
 *
 * Error codes and HTTP status mappings are defined in the ERROR_CODES map.
 */

import type { Request, Response, NextFunction } from 'express';
import type { ApiError } from '@matka/types';

// ---------------------------------------------------------------------------
// Error code catalogue
// ---------------------------------------------------------------------------

interface ErrorCodeDefinition {
  httpStatus: number;
  message: string;
}

export const ERROR_CODES: Record<string, ErrorCodeDefinition> = {
  INVALID_REFERRAL: {
    httpStatus: 400,
    message: 'The referral code is invalid or the admin is inactive.',
  },
  USERNAME_TAKEN: {
    httpStatus: 409,
    message: 'This username is already taken.',
  },
  INVALID_CREDENTIALS: {
    httpStatus: 401,
    message: 'Invalid username or password.',
  },
  UNAUTHORIZED: {
    httpStatus: 401,
    message: 'You must be logged in to access this resource.',
  },
  FORBIDDEN: {
    httpStatus: 403,
    message: 'You do not have permission to access this resource.',
  },
  MARKET_LOCKED: {
    httpStatus: 400,
    message: 'This market is locked and no longer accepting bets.',
  },
  MARKET_CLOSED: {
    httpStatus: 400,
    message: 'This market is closed.',
  },
  INSUFFICIENT_BALANCE: {
    httpStatus: 400,
    message: 'Your wallet balance is insufficient to place this bet.',
  },
  BET_BELOW_MINIMUM: {
    httpStatus: 400,
    message: 'Bet amount is below the minimum allowed.',
  },
  BET_ABOVE_MAXIMUM: {
    httpStatus: 400,
    message: 'Bet amount is above the maximum allowed.',
  },
  INVALID_SELECTION: {
    httpStatus: 400,
    message: 'The selection format is invalid for this bet type.',
  },
  WITHDRAWAL_EXCEEDS_BALANCE: {
    httpStatus: 400,
    message: 'Withdrawal amount exceeds your available balance.',
  },
  PASSWORD_TOO_SHORT: {
    httpStatus: 400,
    message: 'Password must be at least 8 characters long.',
  },
};

// ---------------------------------------------------------------------------
// Custom error class
// ---------------------------------------------------------------------------

/**
 * Application-level error with a known error code.
 * Throw this from service/route handlers to trigger the standard error response.
 */
export class AppError extends Error {
  constructor(
    public code: string,
    public details?: Record<string, unknown>,
  ) {
    super(ERROR_CODES[code]?.message ?? 'An unknown error occurred.');
    this.name = 'AppError';
  }
}

// ---------------------------------------------------------------------------
// Error handler middleware
// ---------------------------------------------------------------------------

/**
 * Express error handler middleware.
 * Must be registered AFTER all routes.
 *
 * Usage:
 *   app.use(errorHandler);
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // If it's an AppError, use the known code and details
  if (err instanceof AppError) {
    const definition = ERROR_CODES[err.code];
    if (definition) {
      const response: ApiError = {
        error: {
          code: err.code,
          message: definition.message,
          ...(err.details && { details: err.details }),
        },
      };
      res.status(definition.httpStatus).json(response);
      return;
    }
  }

  // Otherwise, log the unexpected error and return a generic 500 response
  console.error('[errorHandler] Unexpected error:', err);
  const response: ApiError = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    },
  };
  res.status(500).json(response);
}
