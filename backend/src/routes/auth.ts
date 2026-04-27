import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/connection.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    const employee = await db('employees').where({ email, is_active: true }).first();
    if (!employee) throw new AppError('Invalid credentials', 401);

    const valid = await bcrypt.compare(password, employee.password_hash);
    if (!valid) throw new AppError('Invalid credentials', 401);

    const payload = {
      sub: employee.id,
      email: employee.email,
      system_role: employee.system_role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET as string, {
      expiresIn: '7d' as any,
    });

    res.json({
      data: {
        token,
        employee: {
          id: employee.id,
          first_name: employee.first_name,
          last_name: employee.last_name,
          email: employee.email,
          system_role: employee.system_role,
        },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new AppError('Invalid request body', 422));
    } else {
      next(err);
    }
  }
});

export default router;
