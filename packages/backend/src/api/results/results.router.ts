/**
 * Public Results Router — GET /api/results
 * Returns recent result cycles for all markets.
 * No authentication required.
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../../lib/prisma.js';

const router = Router();

// GET /api/results — last 7 days results for all markets
router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const results = await prisma.resultCycle.findMany({
      where: {
        declared_at: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      include: {
        market: { select: { name: true } },
      },
      orderBy: [{ cycle_date: 'desc' }, { declared_at: 'desc' }],
      take: 500,
    });

    res.status(200).json({
      data: results.map(r => ({
        id: r.id,
        market_name: r.market.name,
        cycle_date: r.cycle_date,
        open_panna: r.open_panna,
        close_panna: r.close_panna,
        jodi: r.jodi,
        open_ank: r.open_ank,
        close_ank: r.close_ank,
        declared_at: r.declared_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
