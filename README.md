# Restaurant Management System (RMS)

A modular restaurant operations platform built for phased delivery.

## Phases

| Phase | Module | Status |
|-------|--------|--------|
| 1 | Staff Rota & Scheduling | **Active** |
| 2 | Booking Management | Designed — not built |
| 3 | Inventory & Stock | Designed — not built |
| 4 | AI Recommendation Engine | Designed — not built |

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Docker (optional but recommended)

### With Docker
```bash
docker-compose up -d
cd backend && npm install && npm run migrate && npm run dev
cd frontend && npm install && npm run dev
```

### Without Docker
```bash
# Start PostgreSQL locally, then:
cd backend
cp .env.example .env  # fill in your DB credentials
npm install
npm run migrate
npm run dev

# In a separate terminal:
cd frontend
npm install
npm run dev
```

## Project Structure

```
rms/
├── backend/
│   ├── src/
│   │   ├── db/           # Knex config + connection
│   │   ├── middleware/   # Auth, error handling, validation
│   │   ├── routes/       # Express route handlers (Phase 1)
│   │   ├── services/     # Business logic layer
│   │   ├── types/        # Shared TypeScript types
│   │   └── utils/        # Helpers (conflict detection, staffing advice)
│   ├── migrations/       # Knex migrations — all phases
│   └── server.ts
├── frontend/
│   └── src/
│       ├── api/          # Axios API client
│       ├── components/
│       │   ├── rota/     # Schedule grid, drag-and-drop
│       │   ├── staff/    # Employee management
│       │   └── shared/   # Reusable UI components
│       ├── hooks/        # React Query hooks
│       ├── pages/        # Route-level pages
│       ├── store/        # Zustand global state
│       └── types/        # Shared TypeScript types
└── docker-compose.yml
```
