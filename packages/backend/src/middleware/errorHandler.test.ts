/**
 * Unit tests for the global Express error handler middleware.
 *
 * Tests verify:
 * - Known AppError codes produce the correct HTTP status and error envelope
 * - Unknown AppError codes fall through to the 500 handler
 * - Generic (non-AppError) errors produce a 500 response
 * - The error envelope shape matches the ApiError interface
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler, AppError, ERROR_CODES } from './errorHandler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const mockReq = {} as Request;
const mockNext = vi.fn() as unknown as NextFunction;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('errorHandler middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AppError with known error codes', () => {
    it.each(Object.entries(ERROR_CODES))(
      'returns HTTP %s for code %s',
      (code, definition) => {
        const err = new AppError(code);
        const res = makeMockRes();

        errorHandler(err, mockReq, res, mockNext);

        expect(res.status).toHaveBeenCalledWith(definition.httpStatus);
        expect(res.json).toHaveBeenCalledWith({
          error: {
            code,
            message: definition.message,
          },
        });
      },
    );

    it('includes details in the response when provided', () => {
      const details = { field: 'username', reason: 'already exists' };
      const err = new AppError('USERNAME_TAKEN', details);
      const res = makeMockRes();

      errorHandler(err, mockReq, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'USERNAME_TAKEN',
          message: ERROR_CODES['USERNAME_TAKEN']!.message,
          details,
        },
      });
    });

    it('omits details key when no details are provided', () => {
      const err = new AppError('INSUFFICIENT_BALANCE');
      const res = makeMockRes();

      errorHandler(err, mockReq, res, mockNext);

      const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(body.error).not.toHaveProperty('details');
    });
  });

  describe('specific error codes', () => {
    it('returns 400 for INVALID_REFERRAL', () => {
      const res = makeMockRes();
      errorHandler(new AppError('INVALID_REFERRAL'), mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 409 for USERNAME_TAKEN', () => {
      const res = makeMockRes();
      errorHandler(new AppError('USERNAME_TAKEN'), mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('returns 401 for INVALID_CREDENTIALS', () => {
      const res = makeMockRes();
      errorHandler(new AppError('INVALID_CREDENTIALS'), mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 for UNAUTHORIZED', () => {
      const res = makeMockRes();
      errorHandler(new AppError('UNAUTHORIZED'), mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 403 for FORBIDDEN', () => {
      const res = makeMockRes();
      errorHandler(new AppError('FORBIDDEN'), mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 400 for MARKET_LOCKED', () => {
      const res = makeMockRes();
      errorHandler(new AppError('MARKET_LOCKED'), mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for MARKET_CLOSED', () => {
      const res = makeMockRes();
      errorHandler(new AppError('MARKET_CLOSED'), mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for INSUFFICIENT_BALANCE', () => {
      const res = makeMockRes();
      errorHandler(new AppError('INSUFFICIENT_BALANCE'), mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for BET_BELOW_MINIMUM', () => {
      const res = makeMockRes();
      errorHandler(new AppError('BET_BELOW_MINIMUM'), mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for BET_ABOVE_MAXIMUM', () => {
      const res = makeMockRes();
      errorHandler(new AppError('BET_ABOVE_MAXIMUM'), mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for INVALID_SELECTION', () => {
      const res = makeMockRes();
      errorHandler(new AppError('INVALID_SELECTION'), mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for WITHDRAWAL_EXCEEDS_BALANCE', () => {
      const res = makeMockRes();
      errorHandler(new AppError('WITHDRAWAL_EXCEEDS_BALANCE'), mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for PASSWORD_TOO_SHORT', () => {
      const res = makeMockRes();
      errorHandler(new AppError('PASSWORD_TOO_SHORT'), mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('AppError with unknown code', () => {
    it('returns 500 for an unrecognised error code', () => {
      const err = new AppError('SOME_UNKNOWN_CODE');
      const res = makeMockRes();

      errorHandler(err, mockReq, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred.',
        },
      });
    });
  });

  describe('generic (non-AppError) errors', () => {
    it('returns 500 for a plain Error', () => {
      const err = new Error('Something went wrong');
      const res = makeMockRes();

      errorHandler(err, mockReq, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred.',
        },
      });
    });

    it('returns 500 for a TypeError', () => {
      const err = new TypeError('Cannot read property of undefined');
      const res = makeMockRes();

      errorHandler(err, mockReq, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('response envelope shape', () => {
    it('always returns an object with an "error" key', () => {
      const res = makeMockRes();
      errorHandler(new AppError('FORBIDDEN'), mockReq, res, mockNext);

      const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
    });
  });
});

describe('AppError class', () => {
  it('sets the name to "AppError"', () => {
    const err = new AppError('FORBIDDEN');
    expect(err.name).toBe('AppError');
  });

  it('sets the message from the error code catalogue', () => {
    const err = new AppError('FORBIDDEN');
    expect(err.message).toBe(ERROR_CODES['FORBIDDEN']!.message);
  });

  it('stores the code', () => {
    const err = new AppError('MARKET_LOCKED');
    expect(err.code).toBe('MARKET_LOCKED');
  });

  it('stores optional details', () => {
    const details = { marketId: 'abc123' };
    const err = new AppError('MARKET_LOCKED', details);
    expect(err.details).toEqual(details);
  });

  it('is an instance of Error', () => {
    expect(new AppError('FORBIDDEN')).toBeInstanceOf(Error);
  });
});
