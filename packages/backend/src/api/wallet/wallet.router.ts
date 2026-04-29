/**
 * Wallet router.
 *
 * Routes:
 *   GET  /api/wallet/balance      — Get current balance (User only)
 *   POST /api/wallet/deposit      — Submit deposit request (User only)
 *   POST /api/wallet/withdraw     — Submit withdrawal request (User only)
 *   GET  /api/wallet/transactions — Get transaction history (User only)
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as walletService from './wallet.service.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { Role } from '@matka/types';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/wallet/balance — User only
// ---------------------------------------------------------------------------
router.get(
  '/balance',
  authenticate,
  requireRole(Role.User),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const result = await walletService.getBalance(userId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/wallet/deposit — User only
// ---------------------------------------------------------------------------
router.post(
  '/deposit',
  authenticate,
  requireRole(Role.User),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { upiRef, amountPoints } = req.body as {
        upiRef: string;
        amountPoints: number;
      };

      const result = await walletService.submitDeposit(userId, upiRef, amountPoints);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/wallet/withdraw — User only
// ---------------------------------------------------------------------------
router.post(
  '/withdraw',
  authenticate,
  requireRole(Role.User),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { amountPoints } = req.body as { amountPoints: number };

      const result = await walletService.submitWithdrawal(userId, amountPoints);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/wallet/transactions — User only
// ---------------------------------------------------------------------------
router.get(
  '/transactions',
  authenticate,
  requireRole(Role.User),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const result = await walletService.getTransactionHistory(userId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
