/**
 * Auth router.
 *
 * Routes:
 *   POST /api/auth/register        — Register a new user with a referral code
 *   POST /api/auth/login           — Login (User, Admin, or SuperAdmin)
 *   POST /api/auth/refresh         — Refresh access token
 *   POST /api/auth/change-password — Change own password (authenticated)
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
router.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password, referralCode } = req.body as {
        username: string;
        password: string;
        referralCode: string;
      };

      const result = await authService.register(username, password, referralCode);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password } = req.body as {
        username: string;
        password: string;
      };

      const result = await authService.login(username, password);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------
router.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.body as { token: string };

      const result = await authService.refreshToken(token);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/auth/change-password (authenticated)
// ---------------------------------------------------------------------------
router.post(
  '/change-password',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword: string;
        newPassword: string;
      };

      // req.user is guaranteed by authenticate middleware
      const userId = req.user!.userId;

      const result = await authService.changePassword(userId, currentPassword, newPassword);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
