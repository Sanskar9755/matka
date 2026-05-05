/**
 * SuperAdmin router.
 *
 * Routes (all SuperAdmin only):
 *   GET   /api/superadmin/admins              — List all admins
 *   POST  /api/superadmin/admins              — Create admin
 *   PUT   /api/superadmin/admins/:id          — Update admin
 *   PATCH /api/superadmin/admins/:id/status   — Activate/deactivate admin
 *   GET   /api/superadmin/analytics           — Global analytics
 *   GET   /api/superadmin/config              — Get platform config
 *   PUT   /api/superadmin/config              — Update platform config
 *   POST  /api/superadmin/results/:marketId   — Manually enter result
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as superadminService from './superadmin.service.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { Role } from '@matka/types';

const router = Router();

// All superadmin routes require authentication and SuperAdmin role
router.use(authenticate, requireRole(Role.SuperAdmin));

// ---------------------------------------------------------------------------
// GET /api/superadmin/admins — List all admins
// ---------------------------------------------------------------------------
router.get(
  '/admins',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await superadminService.listAdmins();
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/superadmin/admins — Create admin
// ---------------------------------------------------------------------------
router.post(
  '/admins',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password } = req.body as { username: string; password: string };
      const result = await superadminService.createAdmin({ username, password });
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /api/superadmin/admins/:id — Update admin
// ---------------------------------------------------------------------------
router.put(
  '/admins/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { username, password, min_bet_points, max_bet_points } = req.body as {
        username?: string;
        password?: string;
        min_bet_points?: number;
        max_bet_points?: number;
      };
      const result = await superadminService.updateAdmin(id, {
        username,
        password,
        min_bet_points,
        max_bet_points,
      });
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/superadmin/admins/:id/status — Activate/deactivate admin
// ---------------------------------------------------------------------------
router.patch(
  '/admins/:id/status',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { is_active } = req.body as { is_active: boolean };
      const result = await superadminService.setAdminStatus(id, is_active);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/superadmin/admins/:id — Delete admin
// ---------------------------------------------------------------------------
router.delete(
  '/admins/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      await superadminService.deleteAdmin(id);
      res.status(200).json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/superadmin/analytics — Global analytics
// ---------------------------------------------------------------------------
router.get(
  '/analytics',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await superadminService.getAnalytics();
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/superadmin/config — Get platform config (SuperAdmin only)
// ---------------------------------------------------------------------------
router.get(
  '/config',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await superadminService.getConfig();
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /api/superadmin/config — Update platform config
// ---------------------------------------------------------------------------
router.put(
  '/config',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        winning_multipliers,
        result_api_endpoint,
        result_poll_interval_sec,
        upi_details,
        feature_flags,
      } = req.body as {
        winning_multipliers?: Record<string, number>;
        result_api_endpoint?: string;
        result_poll_interval_sec?: number;
        upi_details?: string;
        feature_flags?: Record<string, boolean>;
      };
      const result = await superadminService.updateConfig({
        winning_multipliers,
        result_api_endpoint,
        result_poll_interval_sec,
        upi_details,
        feature_flags,
      });
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/superadmin/results/:marketId — Manually enter result
// ---------------------------------------------------------------------------
router.post(
  '/results/:marketId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { marketId } = req.params as { marketId: string };
      const { open_panna, close_panna, jodi, open_ank, close_ank } = req.body as {
        open_panna: string;
        close_panna: string;
        jodi: string;
        open_ank: string;
        close_ank: string;
      };
      const result = await superadminService.manuallyEnterResult(marketId, {
        open_panna,
        close_panna,
        jodi,
        open_ank,
        close_ank,
      });
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
