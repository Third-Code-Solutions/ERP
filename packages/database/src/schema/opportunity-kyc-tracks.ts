import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import {
  opportunityKycTrackStatusEnum,
  opportunityKycTrackTypeEnum,
} from './enums'
import { tenants } from './tenants'
import { opportunities } from './opportunities'
import { users } from './users'

/** WO-11 — one durable Finance-GA / Finance-AR gate per opportunity. */
export const opportunityKycTracks = pgTable(
  'opportunity_kyc_tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    opportunity_id: uuid('opportunity_id').notNull(),
    track_type: opportunityKycTrackTypeEnum('track_type').notNull(),
    status: opportunityKycTrackStatusEnum('status').notNull().default('pending'),
    due_at: timestamp('due_at', { withTimezone: true }).notNull(),
    prepared_by: uuid('prepared_by'),
    prepared_at: timestamp('prepared_at', { withTimezone: true }),
    fc_recommended_by: uuid('fc_recommended_by'),
    fc_recommended_at: timestamp('fc_recommended_at', { withTimezone: true }),
    president_decided_by: uuid('president_decided_by'),
    president_decided_at: timestamp('president_decided_at', { withTimezone: true }),
    decision_reason: text('decision_reason'),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_opportunity_kyc_tracks_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    trackUniqueIdx: uniqueIndex('ux_opportunity_kyc_tracks_track').on(
      table.tenant_id,
      table.opportunity_id,
      table.track_type
    ),
    tenantStatusIdx: index('idx_opportunity_kyc_tracks_tenant_status').on(
      table.tenant_id,
      table.status,
      table.due_at
    ),
    opportunityIdx: index('idx_opportunity_kyc_tracks_opportunity').on(
      table.tenant_id,
      table.opportunity_id
    ),
    opportunityTenantFk: foreignKey({
      name: 'opportunity_kyc_tracks_opportunity_tenant_fk',
      columns: [table.tenant_id, table.opportunity_id],
      foreignColumns: [opportunities.tenant_id, opportunities.id],
    }).onDelete('cascade'),
    preparedByTenantFk: foreignKey({
      name: 'opportunity_kyc_tracks_prepared_by_tenant_fk',
      columns: [table.tenant_id, table.prepared_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    fcRecommendedByTenantFk: foreignKey({
      name: 'opportunity_kyc_tracks_fc_recommended_by_tenant_fk',
      columns: [table.tenant_id, table.fc_recommended_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    presidentDecidedByTenantFk: foreignKey({
      name: 'opportunity_kyc_tracks_president_decided_by_tenant_fk',
      columns: [table.tenant_id, table.president_decided_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    decisionReasonCheck: check(
      'opportunity_kyc_tracks_decision_reason',
      sql`${table.status} not in ('flagged', 'rejected') or (${table.decision_reason} is not null and length(btrim(${table.decision_reason})) > 0)`
    ),
    approvedDecisionCheck: check(
      'opportunity_kyc_tracks_approved_decision',
      sql`${table.status} <> 'approved' or (${table.president_decided_by} is not null and ${table.president_decided_at} is not null and ${table.fc_recommended_at} is not null)`
    ),
  })
)

export type OpportunityKycTrack = typeof opportunityKycTracks.$inferSelect
export type OpportunityKycTrackInsert = typeof opportunityKycTracks.$inferInsert
