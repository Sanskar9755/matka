/**
 * Markets router.
 *
 * Routes:
 *   GET  /api/markets              — List all active markets (any authenticated user)
 *   POST /api/markets              — Create market (SuperAdmin only)
 *   PUT  /api/markets/:id          — Update market (SuperAdmin only)
 *   PATCH /api/markets/:id/status  — Set market status (SuperAdmin only)
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as marketsService from './markets.service.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { Role, MarketStatus } from '@matka/types';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/markets — any authenticated user
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await marketsService.listActiveMarkets();
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/markets — SuperAdmin only
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  requireRole(Role.SuperAdmin),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, open_time, close_time, result_time } = req.body as {
        name: string;
        open_time: string;
        close_time: string;
        result_time: string;
      };

      const result = await marketsService.createMarket({ name, open_time, close_time, result_time });
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /api/markets/:id — SuperAdmin only
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  authenticate,
  requireRole(Role.SuperAdmin),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { name, open_time, close_time, result_time } = req.body as {
        name?: string;
        open_time?: string;
        close_time?: string;
        result_time?: string;
      };

      const result = await marketsService.updateMarket(id, { name, open_time, close_time, result_time });
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/markets/:id/status — SuperAdmin only
// ---------------------------------------------------------------------------
router.patch(
  '/:id/status',
  authenticate,
  requireRole(Role.SuperAdmin),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { status } = req.body as { status: MarketStatus };

      const result = await marketsService.setMarketStatus(id, status);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
