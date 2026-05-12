import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { documents } from './documents'

// Generic signing token table — replaces DocuSeal for entity_types that
// don't need a fully audited multi-party signing flow. The client draws
// a signature in an HTML5 canvas pad; we store the PNG via Supabase
// Storage and stamp `signed_at` on the entity. Audit-logged.
//
// Why not just reuse bom_portal_tokens? It exists, but it's BOM-specific
// (FK to boms). A generic dispatch-by-entity_type table cleans up the
// signing UX so VO / COC / Contract all use the same /portal/sign route.
export const signableEntityTypeEnum = pgEnum('signable_entity_type', [
  'bom',
  'contract',
  'variation_order',
  'coc',
])

export const signatureSessions = pgTable(
  'signature_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    entity_type: signableEntityTypeEnum('entity_type').notNull(),
    entity_id: uuid('entity_id').notNull(),
    // SHA-256 of the URL token. Plaintext token never stored.
    token_hash: varchar('token_hash', { length: 128 }).notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Signer info captured at signing time.
    signer_name: varchar('signer_name', { length: 255 }),
    signer_email: varchar('signer_email', { length: 255 }),
    signer_ip: varchar('signer_ip', { length: 45 }),
    signer_user_agent: text('signer_user_agent'),
    // Stamp + storage reference once signed.
    signed_at: timestamp('signed_at', { withTimezone: true }),
    signature_document_id: uuid('signature_document_id').references(() => documents.id, { onDelete: 'set null' }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_signature_sessions_tenant').on(table.tenant_id),
    entityIdx: index('idx_signature_sessions_entity').on(table.entity_type, table.entity_id),
    tokenHashUq: uniqueIndex('idx_signature_sessions_hash').on(table.token_hash),
  })
)

export type SignatureSession = typeof signatureSessions.$inferSelect
export type SignatureSessionInsert = typeof signatureSessions.$inferInsert
