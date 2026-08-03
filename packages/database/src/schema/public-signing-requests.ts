import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { publicSigningRequestStateEnum } from './enums'
import { signatureSessions } from './signature-sessions'
import { tenants } from './tenants'

/** Durable replay ledger for unauthenticated token-authorized signatures. */
export const publicSigningRequests = pgTable(
  'public_signing_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    signature_session_id: uuid('signature_session_id')
      .notNull()
      .references(() => signatureSessions.id, { onDelete: 'cascade' }),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: varchar('request_hash', { length: 64 }).notNull(),
    state: publicSigningRequestStateEnum('state')
      .notNull()
      .default('processing'),
    result: jsonb('result'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantKeyUq: uniqueIndex('ux_public_signing_requests_tenant_key').on(
      table.tenant_id,
      table.idempotency_key
    ),
    tenantSessionIdx: index('idx_public_signing_requests_tenant_session').on(
      table.tenant_id,
      table.signature_session_id
    ),
    stateIdx: index('idx_public_signing_requests_state').on(
      table.tenant_id,
      table.state
    ),
  })
)

export type PublicSigningRequest = typeof publicSigningRequests.$inferSelect
export type PublicSigningRequestInsert = typeof publicSigningRequests.$inferInsert
