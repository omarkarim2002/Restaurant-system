import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import authRouter from './routes/auth.js';
import employeesRouter from './routes/employees.js';
import schedulesRouter from './routes/schedules.js';
import timeOffRouter from './routes/timeOff.js';
import rolesRouter from './routes/roles.js';
import shiftsRouter from './routes/shifts.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [process.env.FRONTEND_URL, 'http://localhost:5173'].filter(Boolean);
    if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300 });

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/employees', apiLimiter, employeesRouter);
app.use('/api/schedules', apiLimiter, schedulesRouter);
app.use('/api/time-off', apiLimiter, timeOffRouter);
app.use('/api/roles', apiLimiter, rolesRouter);
app.use('/api/shifts', apiLimiter, shiftsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`RMS API running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
