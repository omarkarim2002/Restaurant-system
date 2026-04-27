import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import db from '../db/connection.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// ─── Validation Schemas ────────────────────────────────────────────────────────

const CreateEmployeeSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  role_id: z.string().uuid(),
  employment_type: z.enum(['full_time', 'part_time', 'casual']).default('full_time'),
  max_hours_per_week: z.number().int().min(1).max(60).default(40),
  system_role: z.enum(['staff', 'manager', 'admin']).default('staff'),
  password: z.string().min(8),
});

const UpdateEmployeeSchema = CreateEmployeeSchema.partial().omit({ password: true });

// ─── GET /employees ────────────────────────────────────────────────────────────

router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { active, role_id } = req.query;

    const employees = await db('employees as e')
      .join('roles as r', 'e.role_id', 'r.id')
      .select('e.*', 'r.name as role_name', 'r.min_per_shift', 'r.max_per_shift')
      .modify((q) => {
        if (active !== undefined) q.where('e.is_active', active === 'true');
        if (role_id) q.where('e.role_id', role_id);
      })
      .orderBy(['e.last_name', 'e.first_name']);

    res.json({ data: employees.map(omitPasswordHash) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /employees/:id ────────────────────────────────────────────────────────

router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employee = await db('employees as e')
      .join('roles as r', 'e.role_id', 'r.id')
      .select('e.*', 'r.name as role_name')
      .where('e.id', req.params.id)
      .first();

    if (!employee) throw new AppError('Employee not found', 404);

    res.json({ data: omitPasswordHash(employee) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /employees ───────────────────────────────────────────────────────────

router.post('/', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateEmployeeSchema.parse(req.body);
    const password_hash = await bcrypt.hash(body.password, 12);

    const [employee] = await db('employees')
      .insert({
        ...body,
        password_hash,
        password: undefined, // don't store plaintext
      })
      .returning('*');

    res.status(201).json({ data: omitPasswordHash(employee), message: 'Employee created.' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(err.errors.map((e) => e.message).join(', '), 422));
    } else {
      next(err);
    }
  }
});

// ─── PATCH /employees/:id ──────────────────────────────────────────────────────

router.patch('/:id', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = UpdateEmployeeSchema.parse(req.body);

    const [updated] = await db('employees')
      .where({ id: req.params.id })
      .update({ ...body, updated_at: db.fn.now() })
      .returning('*');

    if (!updated) throw new AppError('Employee not found', 404);

    res.json({ data: omitPasswordHash(updated) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(err.errors.map((e) => e.message).join(', '), 422));
    } else {
      next(err);
    }
  }
});

// ─── DELETE /employees/:id — soft delete ──────────────────────────────────────

router.delete('/:id', authenticate, requireManager, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [updated] = await db('employees')
      .where({ id: req.params.id })
      .update({ is_active: false, updated_at: db.fn.now() })
      .returning('id');

    if (!updated) throw new AppError('Employee not found', 404);

    res.json({ message: 'Employee deactivated.' });
  } catch (err) {
    next(err);
  }
});

// ─── GET /employees/:id/availability ──────────────────────────────────────────

router.get('/:id/availability', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db('availability')
      .where({ employee_id: req.params.id })
      .orderBy('day_of_week');
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /employees/:id/availability ──────────────────────────────────────────

const AvailabilitySchema = z.array(
  z.object({
    day_of_week: z.number().int().min(0).max(6),
    available_from: z.string().optional(),
    available_until: z.string().optional(),
    is_unavailable: z.boolean().default(false),
  })
);

router.put('/:id/availability', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.params.id;
    // Only the employee themselves or a manager can update availability
    if (req.user!.sub !== employeeId && !['manager', 'admin'].includes(req.user!.system_role)) {
      throw new AppError('Forbidden', 403);
    }

    const rows = AvailabilitySchema.parse(req.body);

    await db.transaction(async (trx) => {
      await trx('availability').where({ employee_id: employeeId }).delete();
      if (rows.length > 0) {
        await trx('availability').insert(
          rows.map((r) => ({ ...r, employee_id: employeeId }))
        );
      }
    });

    const updated = await db('availability').where({ employee_id: employeeId }).orderBy('day_of_week');
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError(err.errors.map((e) => e.message).join(', '), 422));
    } else {
      next(err);
    }
  }
});

function omitPasswordHash(employee: any) {
  const { password_hash, ...rest } = employee;
  return rest;
}

export default router;
