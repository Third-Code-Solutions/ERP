import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { purchaseOrders } from './purchase-orders'
import { users } from './users'

// REFACTOR.md M4 + Rework alignment — delivery scheduling, site preparation,
// receipt, inspection, and acceptance. One delivery_schedule per PO line
// batch (we allow one PO to have multiple deliveries when shipments split).

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'scheduled',
  'site_preparing',
  'site_ready',
  'in_transit',
  'received',
  'inspecting',
  'accepted',
  'rejected',
  'cancelled',
])

export const inspectionResultEnum = pgEnum('inspection_result', [
  'pending',
  'pass',
  'fail',
  'partial_pass',
])

export const deliverySchedules = pgTable(
  'delivery_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    purchase_order_id: uuid('purchase_order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    status: deliveryStatusEnum('status').notNull().default('scheduled'),
    scheduled_date: timestamp('scheduled_date', { withTimezone: true }),
    site_address: text('site_address'),
    site_contact_name: varchar('site_contact_name', { length: 255 }),
    site_contact_phone: varchar('site_contact_phone', { length: 64 }),
    site_preparation_notes: text('site_preparation_notes'),
    site_prepared_at: timestamp('site_prepared_at', { withTimezone: true }),
    site_prepared_by: uuid('site_prepared_by').references(() => users.id, { onDelete: 'set null' }),
    received_at: timestamp('received_at', { withTimezone: true }),
    received_by: uuid('received_by').references(() => users.id, { onDelete: 'set null' }),
    received_notes: text('received_notes'),
    rejected_at: timestamp('rejected_at', { withTimezone: true }),
    rejected_reason: text('rejected_reason'),
    accepted_at: timestamp('accepted_at', { withTimezone: true }),
    accepted_by: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    tenantIdx: index('idx_delivery_schedules_tenant').on(table.tenant_id),
    tenantIdUniqueIdx: uniqueIndex(
      'ux_delivery_schedules_tenant_id_id'
    ).on(table.tenant_id, table.id),
    poIdx: index('idx_delivery_schedules_po').on(table.purchase_order_id),
    tenantStatusIdx: index('idx_delivery_schedules_tenant_status').on(table.tenant_id, table.status),
    scheduledIdx: index('idx_delivery_schedules_scheduled').on(table.scheduled_date),
  })
)

export const deliveryInspections = pgTable(
  'delivery_inspections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    delivery_schedule_id: uuid('delivery_schedule_id').notNull().references(() => deliverySchedules.id, { onDelete: 'cascade' }),
    inspector_id: uuid('inspector_id').references(() => users.id, { onDelete: 'set null' }),
    started_at: timestamp('started_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    result: inspectionResultEnum('result').notNull().default('pending'),
    defect_notes: text('defect_notes'),
    acceptance_notes: text('acceptance_notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_delivery_inspections_tenant').on(table.tenant_id),
    scheduleIdx: index('idx_delivery_inspections_schedule').on(table.delivery_schedule_id),
  })
)

export type DeliverySchedule = typeof deliverySchedules.$inferSelect
export type DeliverySchedulePost = typeof deliverySchedules.$inferInsert
export type DeliveryInspection = typeof deliveryInspections.$inferSelect
