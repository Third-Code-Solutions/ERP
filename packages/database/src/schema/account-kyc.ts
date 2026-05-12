import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { accounts } from './accounts'
import { users } from './users'
import { documents } from './documents'
import { kycArtifactTypeEnum } from './enums'

// REFACTOR.md M1 US-001 — one row per required KYC artifact uploaded for
// an Account: AFS×3 years, BIR 2303, VAT certificate, top suppliers list,
// top clients list. Finance reviews the bundle and stamps the parent
// account's `kyc_status`.
export const accountKycArtifacts = pgTable(
  'account_kyc_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    account_id: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    artifact_type: kycArtifactTypeEnum('artifact_type').notNull(),
    document_id: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    notes: text('notes'),
    uploaded_at: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    uploaded_by: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    tenantIdx: index('idx_account_kyc_tenant_id').on(table.tenant_id),
    accountIdx: index('idx_account_kyc_account_id').on(table.account_id),
    accountTypeIdx: index('idx_account_kyc_account_type').on(table.account_id, table.artifact_type),
  })
)

export type AccountKycArtifact = typeof accountKycArtifacts.$inferSelect
export type AccountKycArtifactInsert = typeof accountKycArtifacts.$inferInsert
