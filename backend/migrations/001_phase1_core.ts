import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // ── ROLES ──────────────────────────────────────────────────────────────────
  await knex.schema.createTable('roles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('name', 50).notNullable().unique(); // chef, waiter, manager, barista, etc.
    t.string('description', 255);
    t.integer('min_per_shift').defaultTo(1); // staffing advisory: warn below this
    t.integer('max_per_shift').defaultTo(10); // staffing advisory: warn above this
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ── EMPLOYEES ──────────────────────────────────────────────────────────────
  await knex.schema.createTable('employees', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('first_name', 100).notNullable();
    t.string('last_name', 100).notNullable();
    t.string('email', 255).notNullable().unique();
    t.string('phone', 30);
    t.uuid('role_id').references('id').inTable('roles').onDelete('RESTRICT');
    t.string('employment_type', 20).defaultTo('full_time'); // full_time, part_time, casual
    t.integer('max_hours_per_week').defaultTo(40);
    t.boolean('is_active').defaultTo(true);
    t.string('password_hash', 255); // if employees log in directly
    t.string('system_role', 20).defaultTo('staff'); // staff | manager | admin
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // ── SHIFTS (shift templates) ────────────────────────────────────────────────
  // These are reusable shift definitions, not specific assignments
  await knex.schema.createTable('shifts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('name', 100).notNullable(); // "Morning", "Evening", "Full Day"
    t.string('shift_type', 30).notNullable(); // morning | afternoon | evening | full_day
    t.time('start_time').notNullable(); // e.g. "08:00"
    t.time('end_time').notNullable();   // e.g. "16:00"
    t.decimal('duration_hours', 4, 2); // computed but stored for queries
    t.boolean('is_active').defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ── SCHEDULES (weekly rota containers) ─────────────────────────────────────
  await knex.schema.createTable('schedules', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.date('week_start').notNullable(); // always a Monday
    t.string('status', 20).defaultTo('draft'); // draft | published | archived
    t.uuid('created_by').references('id').inTable('employees').onDelete('SET NULL');
    t.timestamp('published_at');
    t.text('notes');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.unique(['week_start']); // one schedule per week
  });

  // ── SHIFT_ASSIGNMENTS (the actual rota entries) ────────────────────────────
  await knex.schema.createTable('shift_assignments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('schedule_id').notNullable().references('id').inTable('schedules').onDelete('CASCADE');
    t.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    t.uuid('shift_id').notNullable().references('id').inTable('shifts').onDelete('RESTRICT');
    t.date('shift_date').notNullable(); // specific date within the week
    t.text('notes');
    t.timestamp('created_at').defaultTo(knex.fn.now());

    // Prevent the same employee being assigned twice on the same day/shift
    t.unique(['employee_id', 'shift_date', 'shift_id'], { indexName: 'uq_employee_shift_date' });
  });

  // ── AVAILABILITY ────────────────────────────────────────────────────────────
  // Recurring weekly availability pattern
  await knex.schema.createTable('availability', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    t.integer('day_of_week').notNullable(); // 0=Sun, 1=Mon ... 6=Sat
    t.time('available_from'); // null means all day
    t.time('available_until');
    t.boolean('is_unavailable').defaultTo(false); // true = completely unavailable this day
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['employee_id', 'day_of_week']);
  });

  // ── TIME_OFF_REQUESTS ───────────────────────────────────────────────────────
  await knex.schema.createTable('time_off_requests', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('employee_id').notNullable().references('id').inTable('employees').onDelete('CASCADE');
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.string('reason', 500);
    t.string('request_type', 30).defaultTo('holiday'); // holiday | sick | personal | unpaid
    t.string('status', 20).defaultTo('pending'); // pending | approved | rejected
    t.uuid('reviewed_by').references('id').inTable('employees').onDelete('SET NULL');
    t.text('review_notes');
    t.timestamp('reviewed_at');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ── DEMAND_INPUTS ───────────────────────────────────────────────────────────
  // Manual expected cover/demand entries; Phase 2 will auto-populate from bookings
  await knex.schema.createTable('demand_inputs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.date('target_date').notNullable().unique();
    t.integer('expected_covers').defaultTo(0);
    t.string('source', 30).defaultTo('manual'); // manual | booking_sync (Phase 2)
    t.text('notes');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('demand_inputs');
  await knex.schema.dropTableIfExists('time_off_requests');
  await knex.schema.dropTableIfExists('availability');
  await knex.schema.dropTableIfExists('shift_assignments');
  await knex.schema.dropTableIfExists('schedules');
  await knex.schema.dropTableIfExists('shifts');
  await knex.schema.dropTableIfExists('employees');
  await knex.schema.dropTableIfExists('roles');
}
