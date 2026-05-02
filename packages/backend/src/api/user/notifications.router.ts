/**
 * Notifications router — GET /api/user/notifications
 * Returns recent bet results and system alerts for the user.
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { Role } from '@matka/types';
import prisma from '../../lib/prisma.js';

const router = Router();

router.get(
  '/notifications',
  authenticate,
  requireRole(Role.User),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      // Get recent bet results (last 20 settled bets)
      const recentBets = await prisma.bet.findMany({
        where: {
          user_id: userId,
          outcome: { in: ['win', 'loss'] },
        },
        include: { market: { select: { name: true } } },
        orderBy: { placed_at: 'desc' },
        take: 20,
      });

      const notifications = recentBets.map((bet) => ({
        id: bet.id,
        type: bet.outcome === 'win' ? 'win' : 'loss',
        title: bet.outcome === 'win' ? '🎉 You Won!' : '❌ Better luck next time',
        message: `${bet.market.name} — ${bet.bet_type} ${bet.selection}: ${bet.outcome === 'win' ? `+${Number(bet.winning_amount)} pts` : `-${Number(bet.points)} pts`}`,
        time: bet.placed_at,
        read: false,
      }));

      res.status(200).json({ data: { notifications, unread_count: notifications.length } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
