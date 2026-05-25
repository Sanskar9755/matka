/**
 * Bets router.
 *
 * Routes:
 *   POST /api/bets      — Place a bet (User only)
 *   GET  /api/bets/my   — Get own bet history (User only)
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as betsService from './bets.service.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { Role, BetType } from '@matka/types';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/bets — User only
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  requireRole(Role.User),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { marketId, betType, selection, points, session } = req.body as {
        marketId: string;
        betType: BetType;
        selection: string;
        points: number;
        session?: 'open' | 'close';
      };

      const result = await betsService.placeBet(userId, marketId, betType, selection, points, session ?? 'open');
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/bets/my — User only
// ---------------------------------------------------------------------------
router.get(
  '/my',
  authenticate,
  requireRole(Role.User),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const result = await betsService.getBetHistory(userId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
