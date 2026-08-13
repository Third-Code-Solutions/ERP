import { pgTable, bigserial, uuid, varchar, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'

// Append-only audit log with SHA256 hash chain.
// Triggers on the DB side MUST prevent UPDATE and DELETE on this table.
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    actor_id: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    entity_type: varchar('entity_type', { length: 100 }).notNull(),
    entity_id: uuid('entity_id').notNull(),
    // Exact source key for numeric/composite primary keys. UUID rows duplicate
    // the UUID in this column so every audit event has a lossless row identity.
    entity_key: text('entity_key'),
    action: varchar('action', { length: 50 }).notNull(),
    // JSON diff: { field: { before: x, after: y } }
    diff: jsonb('diff'),
    // Hash chain: SHA256(prev_hash || JSON.stringify(row_content))
    prev_hash: varchar('prev_hash', { length: 64 }).notNull().default('genesis'),
    hash: varchar('hash', { length: 64 }).notNull(),
    ip_address: varchar('ip_address', { length: 45 }),
    user_agent: text('user_agent'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_audit_log_tenant_id').on(table.tenant_id),
    entityIdx: index('idx_audit_log_entity').on(table.entity_type, table.entity_id),
    actorIdx: index('idx_audit_log_actor_id').on(table.actor_id),
    tenantCreatedIdx: index('idx_audit_log_tenant_created').on(table.tenant_id, table.created_at),
  })
)

export type AuditLogEntry = typeof auditLog.$inferSelect
export type AuditLogInsert = typeof auditLog.$inferInsert
