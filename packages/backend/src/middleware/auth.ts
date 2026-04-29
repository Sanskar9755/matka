/**
 * Authentication and authorization middleware.
 *
 * - `authenticate`: Verifies the Bearer JWT and attaches `req.user` to the request.
 * - `requireRole(...roles)`: Factory that returns a middleware enforcing role-based access.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler.js';
import { Role } from '@matka/types';
import type { JwtPayload } from '@matka/types';

// ---------------------------------------------------------------------------
// Express Request augmentation
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: Role;
        adminId?: string;
      };
    }
  }
}

// ---------------------------------------------------------------------------
// authenticate middleware
// ---------------------------------------------------------------------------

/**
 * Verifies the `Authorization: Bearer <token>` header.
 * On success, attaches `{ userId, role, adminId? }` to `req.user`.
 * On failure, throws AppError('UNAUTHORIZED').
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('UNAUTHORIZED'));
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    return next(new Error('JWT_SECRET is not configured'));
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      ...(decoded.adminId ? { adminId: decoded.adminId } : {}),
    };

    next();
  } catch {
    next(new AppError('UNAUTHORIZED'));
  }
}

// ---------------------------------------------------------------------------
// requireRole factory
// ---------------------------------------------------------------------------

/**
 * Returns a middleware that checks `req.user.role` is in the allowed roles.
 * Must be used after `authenticate`.
 *
 * @example
 *   router.post('/admin-only', authenticate, requireRole(Role.Admin, Role.SuperAdmin), handler);
 */
export function requireRole(...roles: Role[]) {
  return function roleGuard(req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) {
      return next(new AppError('UNAUTHORIZED'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('FORBIDDEN'));
    }

    next();
  };
}
