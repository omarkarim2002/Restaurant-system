# Future Phases — Design Specification

## Phase 2 — Booking Management

### Data Model

```sql
-- reservations
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  time TIME NOT NULL,
  covers INTEGER NOT NULL,           -- number of guests
  guest_name VARCHAR(200) NOT NULL,
  guest_email VARCHAR(255),
  guest_phone VARCHAR(30),
  status VARCHAR(20) DEFAULT 'confirmed', -- confirmed | cancelled | no_show | seated | completed
  table_id UUID REFERENCES tables(id),
  notes TEXT,
  source VARCHAR(30) DEFAULT 'manual',   -- manual | online | phone
  created_at TIMESTAMP DEFAULT NOW()
);

-- tables
CREATE TABLE tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL,         -- "Table 4", "Bar 1"
  capacity INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- daily_covers_summary (materialised or computed view)
-- SELECT date, SUM(covers) as total_covers, COUNT(*) as reservation_count
-- FROM reservations WHERE status NOT IN ('cancelled', 'no_show')
-- GROUP BY date
```

### Integration with Phase 1 (Rota)

When bookings are active, `demand_inputs` gets auto-populated:

```typescript
// services/bookingSync.ts
// Run nightly or on booking change:
async function syncDemandFromBookings(date: string): Promise<void> {
  const { total_covers } = await db('reservations')
    .where({ date })
    .whereNotIn('status', ['cancelled', 'no_show'])
    .sum('covers as total_covers')
    .first();

  await db('demand_inputs')
    .insert({ target_date: date, expected_covers: total_covers, source: 'booking_sync' })
    .onConflict('target_date')
    .merge({ expected_covers: total_covers, source: 'booking_sync', updated_at: db.fn.now() });
}
```

The staffing advisory (`analyseSchedule`) already reads `demand_inputs`. No changes needed to Phase 1.

### Staffing Impact Logic

Add to `staffingAdvisor.ts`:
```typescript
// Rule: 1 waiter per 15 covers, 1 chef per 20 covers
// If covers > threshold and staff count < required → understaffed warning
const COVERS_PER_WAITER = 15;
const COVERS_PER_CHEF = 20;
```

---

## Phase 3 — Inventory & Stock

### Data Model

```sql
-- ingredients
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  unit VARCHAR(30) NOT NULL,           -- kg, litres, units, portions
  category VARCHAR(50),                -- produce, protein, dairy, dry goods
  reorder_threshold DECIMAL(10, 3),    -- auto-warn when stock falls below this
  supplier_id UUID REFERENCES suppliers(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- stock_levels (current inventory snapshot)
CREATE TABLE stock_levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  quantity DECIMAL(10, 3) NOT NULL DEFAULT 0,
  expiry_date DATE,
  location VARCHAR(100),               -- "Walk-in fridge", "Dry store"
  last_checked_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- stock_movements (append-only audit log)
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  movement_type VARCHAR(20) NOT NULL,  -- delivery | usage | waste | adjustment | order
  quantity DECIMAL(10, 3) NOT NULL,    -- positive = in, negative = out
  recorded_by UUID REFERENCES employees(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- deliveries
CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID REFERENCES suppliers(id),
  delivery_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'expected', -- expected | received | partial
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- delivery_items
CREATE TABLE delivery_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id),
  quantity_ordered DECIMAL(10, 3),
  quantity_received DECIMAL(10, 3),
  unit_cost DECIMAL(10, 2)
);

-- suppliers
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  contact_name VARCHAR(200),
  email VARCHAR(255),
  phone VARCHAR(30),
  lead_time_days INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true
);
```

### Connection to Bookings

Expected covers → estimate usage:
```typescript
// When 40 covers are expected on Friday, estimate ingredient usage:
// chicken: 40 × avg_portion_weight × likelihood_of_ordering
// This is Phase 4 territory but the data structure is ready here
```

---

## Phase 4 — AI Recommendation Engine

### Architecture

The AI layer is a separate service (can be Python FastAPI or a dedicated Node service) that reads from the same PostgreSQL database.

```
┌─────────────────────────────────────────────────────┐
│  AI Recommendation Service (Python / FastAPI)        │
│                                                      │
│  ┌─────────────────────┐  ┌──────────────────────┐  │
│  │ Demand Forecaster   │  │ Order Recommender    │  │
│  │                     │  │                      │  │
│  │ Input:              │  │ Input:               │  │
│  │  - Historical covers│  │  - Predicted demand  │  │
│  │  - Day of week      │  │  - Current stock     │  │
│  │  - Seasonal flags   │  │  - Lead times        │  │
│  │                     │  │  - Historical usage  │  │
│  │ Output:             │  │                      │  │
│  │  - Predicted covers │  │ Output:              │  │
│  │  - Confidence %     │  │  - What to order     │  │
│  └─────────────────────┘  │  - How much          │  │
│                            │  - By when           │  │
│                            └──────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Model Progression

**Stage 1 — Simple averages (build first)**
```python
# Predict covers for a given day of week
def predict_covers(day_of_week: int, weeks_lookback: int = 8) -> dict:
    historical = db.query("""
        SELECT AVG(r.covers) as avg_covers, STDDEV(r.covers) as std_dev
        FROM reservations r
        WHERE EXTRACT(DOW FROM r.date) = :dow
          AND r.date >= NOW() - INTERVAL ':weeks weeks'
          AND r.status NOT IN ('cancelled', 'no_show')
    """, dow=day_of_week, weeks=weeks_lookback).first()
    return {
        "predicted_covers": round(historical.avg_covers or 0),
        "confidence": "low" if historical.std_dev > 20 else "medium",
        "method": "rolling_average"
    }
```

**Stage 2 — Weighted averages (recent weeks count more)**
```python
# Apply exponential weighting — last week counts 2× more than 8 weeks ago
weights = [2**i for i in range(weeks_lookback)]
weighted_avg = sum(covers[i] * weights[i] for i in ...) / sum(weights)
```

**Stage 3 — Linear regression (add seasonality, events)**
```python
from sklearn.linear_model import LinearRegression
# Features: day_of_week, month, is_holiday, avg_weather_temp, special_event_flag
# Train on 6+ months of data
```

**Stage 4 — Production ML (if justified)**
- Facebook Prophet for time-series forecasting
- Or a simple LSTM if you have 2+ years of data
- Only add complexity if Stage 1–3 accuracy is insufficient

### Ingredient Usage Prediction

```python
def predict_ingredient_usage(ingredient_id: str, predicted_covers: int) -> dict:
    # 1. Get historical usage per cover for this ingredient
    avg_usage_per_cover = db.query("""
        SELECT SUM(ABS(quantity)) / SUM(r.covers_that_day) as usage_per_cover
        FROM stock_movements sm
        JOIN daily_covers_summary r ON DATE(sm.created_at) = r.date
        WHERE sm.ingredient_id = :id AND sm.movement_type = 'usage'
    """, id=ingredient_id).scalar()

    # 2. Project
    predicted_usage = avg_usage_per_cover * predicted_covers

    # 3. Current stock
    current_stock = db.query("SELECT quantity FROM stock_levels WHERE ingredient_id = :id", id=ingredient_id).scalar()

    # 4. Days until stockout
    daily_usage = predicted_usage  # simplification
    days_until_stockout = (current_stock / daily_usage) if daily_usage > 0 else None

    return {
        "ingredient_id": ingredient_id,
        "predicted_usage": round(predicted_usage, 3),
        "current_stock": current_stock,
        "days_until_stockout": days_until_stockout,
        "should_order": current_stock < (days_until_stockout or 0) * daily_usage
    }
```

### New DB Tables for Phase 4

```sql
-- usage_predictions (store AI outputs for audit trail)
CREATE TABLE usage_predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_date DATE NOT NULL,
  ingredient_id UUID REFERENCES ingredients(id),
  predicted_covers INTEGER,
  predicted_usage DECIMAL(10, 3),
  model_version VARCHAR(50),
  confidence VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- order_recommendations
CREATE TABLE order_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id UUID REFERENCES ingredients(id),
  recommended_quantity DECIMAL(10, 3),
  recommended_order_date DATE,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- pending | ordered | dismissed
  created_at TIMESTAMP DEFAULT NOW()
);
```

### API Endpoints (Phase 4)

```
GET  /api/ai/demand-forecast?date=2024-03-15
GET  /api/ai/ingredient-alerts          -- items below reorder threshold
GET  /api/ai/order-recommendations      -- what to order this week
POST /api/ai/order-recommendations/:id/dismiss
GET  /api/ai/waste-insights             -- items with high waste percentage
```

---

## Integration Summary

```
Phase 1  →  Phase 2:  demand_inputs.source = 'booking_sync' feeds staffing advisor
Phase 2  →  Phase 3:  reservation.covers → estimate ingredient needs per service
Phase 3  →  Phase 4:  stock_movements + historical covers → ML training data
Phase 4  →  Phase 1:  AI-suggested rota adjustments based on predicted covers
```

Every phase adds to the same database, touches the same service layer, and plugs into the same API gateway. No rewrites required.
