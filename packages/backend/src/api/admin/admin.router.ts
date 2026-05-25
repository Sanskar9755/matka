/**
 * Admin router.
 *
 * Routes (all Admin only):
 *   GET  /api/admin/users                       — List users under this admin
 *   GET  /api/admin/users/:id                   — Get user profile
 *   GET  /api/admin/transactions/pending        — List pending transactions
 *   POST /api/admin/transactions/:id/approve    — Approve a transaction
 *   POST /api/admin/transactions/:id/reject     — Reject a transaction
 *   GET  /api/admin/dashboard/:marketId         — Live bet dashboard
 *   PUT  /api/admin/settings/bet-limits         — Update bet limits
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as adminService from './admin.service.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { Role } from '@matka/types';

const router = Router();

// All admin routes require authentication and Admin role
router.use(authenticate, requireRole(Role.Admin));

// ---------------------------------------------------------------------------
// GET /api/admin/profile — Get current admin's own profile (name, referral code)
// ---------------------------------------------------------------------------
router.get(
  '/profile',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.userId;
      const admin = await (await import('../../lib/prisma.js')).default.admin.findUnique({
        where: { id: adminId },
        select: { id: true, username: true, referral_code: true, min_bet_points: true, max_bet_points: true },
      });
      res.status(200).json({ data: admin });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/admin/users — List users under this admin
// ---------------------------------------------------------------------------
router.get(
  '/users',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.userId;
      const result = await adminService.listUsers(adminId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/admin/users/:id — Get user profile
// ---------------------------------------------------------------------------
router.get(
  '/users/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.userId;
      const { id } = req.params as { id: string };
      const result = await adminService.getUserProfile(adminId, id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/admin/transactions/pending — List pending transactions
// ---------------------------------------------------------------------------
router.get(
  '/transactions/pending',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.userId;
      const result = await adminService.listPendingTransactions(adminId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/admin/transactions/:id/approve — Approve a transaction
// ---------------------------------------------------------------------------
router.post(
  '/transactions/:id/approve',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.userId;
      const { id } = req.params as { id: string };
      const result = await adminService.approveTransaction(adminId, id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/admin/transactions/:id/reject — Reject a transaction
// ---------------------------------------------------------------------------
router.post(
  '/transactions/:id/reject',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.userId;
      const { id } = req.params as { id: string };
      const result = await adminService.rejectTransaction(adminId, id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/:marketId — Live bet dashboard
// ---------------------------------------------------------------------------
router.get(
  '/dashboard/:marketId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.userId;
      const { marketId } = req.params as { marketId: string };
      const result = await adminService.getLiveBetDashboard(adminId, marketId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/admin/bet-analysis/:marketId — Detailed bet analysis per number/panna
// ---------------------------------------------------------------------------
router.get(
  '/bet-analysis/:marketId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.userId;
      const { marketId } = req.params as { marketId: string };
      const result = await adminService.getBetAnalysis(adminId, marketId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /api/admin/settings/bet-limits — Update bet limits
// ---------------------------------------------------------------------------
router.put(
  '/settings/bet-limits',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.userId;
      const { min, max } = req.body as { min: number; max: number };
      const result = await adminService.updateBetLimits(adminId, min, max);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/credit-points — Credit points to a user
// ---------------------------------------------------------------------------
router.post(
  '/users/:id/credit-points',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.userId;
      const { id } = req.params as { id: string };
      const { amount, note } = req.body as { amount: number; note?: string };
      const result = await adminService.creditUserPoints(adminId, id, amount, note);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/admin/point-credits — Get admin's point credit history
// ---------------------------------------------------------------------------
router.get(
  '/point-credits',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.userId;
      const result = await adminService.getAdminPointCreditHistory(adminId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
