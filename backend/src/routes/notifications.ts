import { Router } from 'express';
import db from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /notifications — current user's notifications
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { limit, unread_only } = req.query;
    const userId = (req as any).user?.sub;

    const rows = await db('notifications')
      .where({ user_id: userId })
      .modify((q: any) => { if (unread_only === 'true') q.where({ is_read: false }); })
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit as string) || 30)
      .select('*');

    const unreadCount = await db('notifications')
      .where({ user_id: userId, is_read: false }).count('* as c').first();

    res.json({ data: { notifications: rows, unread_count: parseInt(unreadCount?.c as string || '0') } });
  } catch (err) { next(err); }
});

// POST /notifications/mark-read — mark a specific notification or all read
router.post('/mark-read', authenticate, async (req, res, next) => {
  try {
    const { id, all } = req.body;
    const userId = (req as any).user?.sub;
    if (all) {
      await db('notifications').where({ user_id: userId, is_read: false }).update({ is_read: true });
    } else if (id) {
      await db('notifications').where({ id, user_id: userId }).update({ is_read: true });
    }
    res.json({ message: 'Marked as read' });
  } catch (err) { next(err); }
});

export default router;
