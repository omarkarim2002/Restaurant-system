import { Router, Request, Response, NextFunction } from 'express';
import db from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const roles = await db('roles').select('*').orderBy('name');
    res.json({ data: roles });
  } catch (err) {
    next(err);
  }
});

export default router;
