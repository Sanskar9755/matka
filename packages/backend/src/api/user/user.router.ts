/**
 * User router.
 *
 * Routes:
 *   GET /api/user/profile — Get current user's profile with wallet & stats
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { Role } from '@matka/types';
import prisma from '../../lib/prisma.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/user/profile — User only
// ---------------------------------------------------------------------------
router.get(
  '/profile',
  authenticate,
  requireRole(Role.User),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true,
          admin: {
            select: { username: true, referral_code: true },
          },
          _count: {
            select: { bets: true },
          },
        },
      });

      if (!user) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
        return;
      }

      // Total winnings
      const winningsAgg = await prisma.bet.aggregate({
        where: { user_id: userId, outcome: 'win' },
        _sum: { winning_amount: true },
      });

      // Total bet amount
      const betsAgg = await prisma.bet.aggregate({
        where: { user_id: userId },
        _sum: { points: true },
      });

      res.status(200).json({
        data: {
          id: user.id,
          username: user.username,
          role: user.role,
          is_active: user.is_active,
          created_at: user.created_at,
          admin_name: user.admin.username,
          wallet: {
            balance_points: Number(user.wallet?.balance_points ?? 0),
            held_points: Number(user.wallet?.held_points ?? 0),
            available_points: Number((user.wallet?.balance_points ?? 0n) - (user.wallet?.held_points ?? 0n)),
          },
          stats: {
            total_bets: user._count.bets,
            total_bet_amount: Number(betsAgg._sum.points ?? 0),
            total_winnings: Number(winningsAgg._sum.winning_amount ?? 0),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
