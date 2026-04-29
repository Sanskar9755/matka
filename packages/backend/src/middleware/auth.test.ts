/**
 * Unit tests for auth middleware.
 *
 * Tests authenticate and requireRole without real JWT verification.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { Role } from '@matka/types';

// ---------------------------------------------------------------------------
// Mock jsonwebtoken
// ---------------------------------------------------------------------------
vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

import jwt from 'jsonwebtoken';
import { authenticate, requireRole } from './auth.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response {
  return {} as Response;
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// ---------------------------------------------------------------------------
// authenticate tests
// ---------------------------------------------------------------------------

describe('authenticate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['JWT_SECRET'] = 'test-secret-at-least-16-chars';
  });

  it('calls next with UNAUTHORIZED when Authorization header is missing', () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();
    const next = makeNext();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });

  it('calls next with UNAUTHORIZED when Authorization header does not start with Bearer', () => {
    const req = makeReq({ headers: { authorization: 'Basic sometoken' } });
    const res = makeRes();
    const next = makeNext();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });

  it('calls next with UNAUTHORIZED when token is invalid', () => {
    const req = makeReq({ headers: { authorization: 'Bearer invalid.token' } });
    const res = makeRes();
    const next = makeNext();

    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error('invalid token');
    });

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });

  it('calls next with UNAUTHORIZED when token is expired', () => {
    const req = makeReq({ headers: { authorization: 'Bearer expired.token' } });
    const res = makeRes();
    const next = makeNext();

    vi.mocked(jwt.verify).mockImplementation(() => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      throw err;
    });

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });

  it('attaches user to req and calls next() on valid token', () => {
    const req = makeReq({ headers: { authorization: 'Bearer valid.token' } });
    const res = makeRes();
    const next = makeNext();

    vi.mocked(jwt.verify).mockReturnValue({
      userId: 'user-uuid-1',
      role: Role.User,
      adminId: 'admin-uuid-1',
    } as never);

    authenticate(req, res, next);

    expect(req.user).toEqual({
      userId: 'user-uuid-1',
      role: Role.User,
      adminId: 'admin-uuid-1',
    });
    expect(next).toHaveBeenCalledWith(); // called with no arguments = success
  });

  it('attaches user without adminId for admin tokens', () => {
    const req = makeReq({ headers: { authorization: 'Bearer admin.token' } });
    const res = makeRes();
    const next = makeNext();

    vi.mocked(jwt.verify).mockReturnValue({
      userId: 'admin-uuid-1',
      role: Role.Admin,
    } as never);

    authenticate(req, res, next);

    expect(req.user).toEqual({
      userId: 'admin-uuid-1',
      role: Role.Admin,
    });
    expect(req.user?.adminId).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });
});

// ---------------------------------------------------------------------------
// requireRole tests
// ---------------------------------------------------------------------------

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next with UNAUTHORIZED when req.user is not set', () => {
    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    const guard = requireRole(Role.Admin);
    guard(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });

  it('calls next with FORBIDDEN when user role is not in allowed roles', () => {
    const req = makeReq();
    req.user = { userId: 'user-uuid-1', role: Role.User };
    const res = makeRes();
    const next = makeNext();

    const guard = requireRole(Role.Admin, Role.SuperAdmin);
    guard(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('calls next with FORBIDDEN when admin tries to access superadmin route', () => {
    const req = makeReq();
    req.user = { userId: 'admin-uuid-1', role: Role.Admin };
    const res = makeRes();
    const next = makeNext();

    const guard = requireRole(Role.SuperAdmin);
    guard(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('calls next() without error when role is allowed', () => {
    const req = makeReq();
    req.user = { userId: 'admin-uuid-1', role: Role.Admin };
    const res = makeRes();
    const next = makeNext();

    const guard = requireRole(Role.Admin, Role.SuperAdmin);
    guard(req, res, next);

    expect(next).toHaveBeenCalledWith(); // no error
  });

  it('allows superadmin when superadmin role is required', () => {
    const req = makeReq();
    req.user = { userId: 'superadmin-uuid', role: Role.SuperAdmin };
    const res = makeRes();
    const next = makeNext();

    const guard = requireRole(Role.SuperAdmin);
    guard(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('allows user role when user role is required', () => {
    const req = makeReq();
    req.user = { userId: 'user-uuid-1', role: Role.User, adminId: 'admin-uuid-1' };
    const res = makeRes();
    const next = makeNext();

    const guard = requireRole(Role.User);
    guard(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});
