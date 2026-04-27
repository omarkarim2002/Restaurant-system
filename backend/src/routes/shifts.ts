import { Router, Request, Response, NextFunction } from 'express';
import db from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const shifts = await db('shifts').where({ is_active: true }).select('*').orderBy('start_time');
    res.json({ data: shifts });
  } catch (err) {
    next(err);
  }
});

export default router;
