import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import authRouter from './routes/auth.js';
import employeesRouter from './routes/employees.js';
import schedulesRouter from './routes/schedules.js';
import timeOffRouter from './routes/timeOff.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Security & Parsing ────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

// Rate limiting — stricter on auth routes
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300 });

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/employees', apiLimiter, employeesRouter);
app.use('/api/schedules', apiLimiter, schedulesRouter);
app.use('/api/time-off', apiLimiter, timeOffRouter);

// ─── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`RMS API running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;

/*
 * ─── PHASE 2 INTEGRATION POINT ──────────────────────────────────────────────
 * When bookings are built, add:
 *   import bookingsRouter from './routes/bookings.js';
 *   app.use('/api/bookings', apiLimiter, bookingsRouter);
 *
 * ─── PHASE 3 INTEGRATION POINT ──────────────────────────────────────────────
 * When inventory is built, add:
 *   import inventoryRouter from './routes/inventory.js';
 *   app.use('/api/inventory', apiLimiter, inventoryRouter);
 *
 * ─── PHASE 4 INTEGRATION POINT ──────────────────────────────────────────────
 * When the AI engine is ready, add:
 *   import aiRouter from './routes/ai.js';
 *   app.use('/api/ai', apiLimiter, aiRouter);
 */
