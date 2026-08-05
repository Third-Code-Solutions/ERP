import { pgTable, uuid, varchar, text, bigint, integer, timestamp, index, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { projects } from './projects'
import { invoices } from './invoices'
import { documents } from './documents'
import { users } from './users'

// Progress Milestone Claim flow: create, submit, certify, hand over to
// Finance, issue invoice, and track payment. Bridges weekly progress to
// invoices.

export const progressClaimStatusEnum = pgEnum('progress_claim_status', [
  'draft',
  'submitted',
  'certificate_pending',
  'certified',
  'handed_over_finance',
  'invoiced',
  'paid',
  'rejected',
  'cancelled',
])

export const progressClaimDocumentKindEnum = pgEnum('progress_claim_document_kind', [
  'photo',
  'certificate',
  'measurement',
  'other',
])

export const progressClaims = pgTable(
  'progress_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    claim_number: varchar('claim_number', { length: 32 }).notNull(),
    milestone_pct: integer('milestone_pct').notNull(),
    amount_cents: bigint('amount_cents', { mode: 'number' }).notNull().default(0),
    description: text('description'),
    status: progressClaimStatusEnum('status').notNull().default('draft'),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    submitted_by: uuid('submitted_by').references(() => users.id, { onDelete: 'set null' }),
    certified_at: timestamp('certified_at', { withTimezone: true }),
    certified_by: uuid('certified_by').references(() => users.id, { onDelete: 'set null' }),
    certificate_document_id: uuid('certificate_document_id').references(() => documents.id, { onDelete: 'set null' }),
    handed_over_to_finance_at: timestamp('handed_over_to_finance_at', { withTimezone: true }),
    handed_over_to_finance_by: uuid('handed_over_to_finance_by').references(() => users.id, { onDelete: 'set null' }),
    invoice_id: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    paid_at: timestamp('paid_at', { withTimezone: true }),
    rejected_at: timestamp('rejected_at', { withTimezone: true }),
    rejected_reason: text('rejected_reason'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    tenantIdx: index('idx_progress_claims_tenant').on(table.tenant_id),
    projectIdx: index('idx_progress_claims_project').on(table.project_id),
    tenantStatusIdx: index('idx_progress_claims_tenant_status').on(table.tenant_id, table.status),
    tenantNumberUq: uniqueIndex('idx_progress_claims_tenant_number').on(table.tenant_id, table.claim_number),
  })
)

export const progressClaimDocuments = pgTable(
  'progress_claim_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    claim_id: uuid('claim_id').notNull().references(() => progressClaims.id, { onDelete: 'cascade' }),
    document_id: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    kind: progressClaimDocumentKindEnum('kind').notNull().default('photo'),
    caption: varchar('caption', { length: 255 }),
    uploaded_at: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    uploaded_by: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    claimIdx: index('idx_progress_claim_docs_claim').on(table.claim_id),
  })
)

export type ProgressClaim = typeof progressClaims.$inferSelect
export type ProgressClaimInsert = typeof progressClaims.$inferInsert
