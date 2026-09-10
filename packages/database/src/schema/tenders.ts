import {
  check,
  boolean,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { boms } from './boms'
import { documents } from './documents'
import { opportunities } from './opportunities'
import { tenants } from './tenants'
import { users } from './users'
import { vendors } from './vendors'

// Tender intake is deliberately opportunity-scoped. A client-issued BOQ is
// evidence until a won opportunity has a project/BOM; it must not create a
// second commercial scope model before conversion.
// PostgreSQL's migration uses column-specific `ON DELETE SET NULL` actions
// for nullable references. Drizzle's foreign-key metadata cannot represent
// that column list, so these composite references intentionally stay `no
// action` here to prevent an unsafe generated migration from nulling tenant_id.
export const tenderPackageStatusEnum = pgEnum('tender_package_status', [
  'draft',
  'open',
  'evaluating',
  'submitted',
  'closed',
])

export const tenderSourceModeEnum = pgEnum('tender_source_mode', [
  'client_issued_boq',
  'abi_generated_bom',
])

export const tenderDeviationCategoryEnum = pgEnum('tender_deviation_category', [
  'scope',
  'quantity',
  'unit',
  'exclusion',
  'schedule',
  'commercial',
])

export const tenderDeviationStatusEnum = pgEnum('tender_deviation_status', [
  'open',
  'responded',
  'accepted',
  'rejected',
])

export const tenderCriterionTypeEnum = pgEnum('tender_criterion_type', [
  'price',
  'technical',
  'schedule',
  'safety',
  'experience',
  'commercial',
  'other',
])

export const tenderVendorProfileStatusEnum = pgEnum('tender_vendor_profile_status', [
  'draft',
  'reviewing',
  'qualified',
  'declined',
])

export const tenderPackages = pgTable(
  'tender_packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    opportunity_id: uuid('opportunity_id').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    reference: varchar('reference', { length: 120 }).notNull(),
    source_mode: tenderSourceModeEnum('source_mode').notNull(),
    status: tenderPackageStatusEnum('status').notNull().default('draft'),
    tor_document_id: uuid('tor_document_id'),
    boq_document_id: uuid('boq_document_id'),
    bound_bom_id: uuid('bound_bom_id'),
    closing_at: timestamp('closing_at', { withTimezone: true }),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    client_request_id: uuid('client_request_id'),
    version: integer('version').notNull().default(1),
    created_by: uuid('created_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_tender_packages_tenant_id_id').on(table.tenant_id, table.id),
    clientRequestUniqueIdx: uniqueIndex('ux_tender_packages_tenant_client_request').on(table.tenant_id, table.client_request_id),
    tenantIdx: index('idx_tender_packages_tenant_id').on(table.tenant_id),
    opportunityIdx: index('idx_tender_packages_opportunity_id').on(table.opportunity_id),
    statusIdx: index('idx_tender_packages_tenant_status').on(table.tenant_id, table.status),
    opportunityTenantFk: foreignKey({
      name: 'tender_packages_opportunity_tenant_fk',
      columns: [table.tenant_id, table.opportunity_id],
      foreignColumns: [opportunities.tenant_id, opportunities.id],
    }).onDelete('cascade'),
    torDocumentTenantFk: foreignKey({
      name: 'tender_packages_tor_document_tenant_fk',
      columns: [table.tenant_id, table.tor_document_id],
      foreignColumns: [documents.tenant_id, documents.id],
    }).onDelete('no action'),
    boqDocumentTenantFk: foreignKey({
      name: 'tender_packages_boq_document_tenant_fk',
      columns: [table.tenant_id, table.boq_document_id],
      foreignColumns: [documents.tenant_id, documents.id],
    }).onDelete('no action'),
    boundBomTenantFk: foreignKey({
      name: 'tender_packages_bound_bom_tenant_fk',
      columns: [table.tenant_id, table.bound_bom_id],
      foreignColumns: [boms.tenant_id, boms.id],
    }).onDelete('no action'),
    createdByTenantFk: foreignKey({
      name: 'tender_packages_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('no action'),
    titleCheck: check('tender_packages_title_nonempty', sql`${table.title} = btrim(${table.title}) and length(${table.title}) > 0`),
    referenceCheck: check('tender_packages_reference_nonempty', sql`${table.reference} = btrim(${table.reference}) and length(${table.reference}) > 0`),
    versionCheck: check('tender_packages_version_positive', sql`${table.version} > 0`),
  }),
)

export const tenderDeviations = pgTable(
  'tender_deviations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    tender_id: uuid('tender_id').notNull(),
    category: tenderDeviationCategoryEnum('category').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    source_reference: varchar('source_reference', { length: 255 }).notNull().default(''),
    response: text('response').notNull().default(''),
    owner_id: uuid('owner_id'),
    status: tenderDeviationStatusEnum('status').notNull().default('open'),
    version: integer('version').notNull().default(1),
    created_by: uuid('created_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_tender_deviations_tenant_id_id').on(table.tenant_id, table.id),
    tenantIdx: index('idx_tender_deviations_tenant_id').on(table.tenant_id),
    tenderIdx: index('idx_tender_deviations_tender_id').on(table.tender_id),
    tenderStatusIdx: index('idx_tender_deviations_tender_status').on(table.tender_id, table.status),
    tenderTenantFk: foreignKey({
      name: 'tender_deviations_tender_tenant_fk',
      columns: [table.tenant_id, table.tender_id],
      foreignColumns: [tenderPackages.tenant_id, tenderPackages.id],
    }).onDelete('cascade'),
    ownerTenantFk: foreignKey({
      name: 'tender_deviations_owner_tenant_fk',
      columns: [table.tenant_id, table.owner_id],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('no action'),
    createdByTenantFk: foreignKey({
      name: 'tender_deviations_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('no action'),
    versionCheck: check('tender_deviations_version_positive', sql`${table.version} > 0`),
  }),
)

export const tenderEvaluationCriteria = pgTable(
  'tender_evaluation_criteria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    tender_id: uuid('tender_id').notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description').notNull().default(''),
    criterion_type: tenderCriterionTypeEnum('criterion_type').notNull(),
    weight_bps: integer('weight_bps').notNull(),
    is_required: boolean('is_required').notNull().default(false),
    sort_order: integer('sort_order').notNull().default(0),
    version: integer('version').notNull().default(1),
    created_by: uuid('created_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_tender_criteria_tenant_id_id').on(table.tenant_id, table.id),
    identityUniqueIdx: uniqueIndex('ux_tender_criteria_tender_name').on(table.tenant_id, table.tender_id, table.name),
    tenderIdx: index('idx_tender_criteria_tender_id').on(table.tender_id),
    tenderTenantFk: foreignKey({
      name: 'tender_criteria_tender_tenant_fk',
      columns: [table.tenant_id, table.tender_id],
      foreignColumns: [tenderPackages.tenant_id, tenderPackages.id],
    }).onDelete('cascade'),
    createdByTenantFk: foreignKey({
      name: 'tender_criteria_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('no action'),
    weightCheck: check('tender_criteria_weight_bps', sql`${table.weight_bps} > 0 and ${table.weight_bps} <= 10000`),
    versionCheck: check('tender_criteria_version_positive', sql`${table.version} > 0`),
  }),
)

export const tenderVendorProfiles = pgTable(
  'tender_vendor_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    tender_id: uuid('tender_id').notNull(),
    vendor_id: uuid('vendor_id').notNull(),
    trade: varchar('trade', { length: 120 }).notNull().default(''),
    capability_summary: text('capability_summary').notNull().default(''),
    qualification_summary: text('qualification_summary').notNull().default(''),
    availability_notes: text('availability_notes').notNull().default(''),
    compliance_notes: text('compliance_notes').notNull().default(''),
    status: tenderVendorProfileStatusEnum('status').notNull().default('draft'),
    version: integer('version').notNull().default(1),
    created_by: uuid('created_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_tender_vendor_profiles_tenant_id_id').on(table.tenant_id, table.id),
    tenderVendorUniqueIdx: uniqueIndex('ux_tender_vendor_profiles_tender_vendor').on(table.tenant_id, table.tender_id, table.vendor_id),
    tenderIdx: index('idx_tender_vendor_profiles_tender_id').on(table.tender_id),
    vendorIdx: index('idx_tender_vendor_profiles_vendor_id').on(table.vendor_id),
    tenderTenantFk: foreignKey({
      name: 'tender_vendor_profiles_tender_tenant_fk',
      columns: [table.tenant_id, table.tender_id],
      foreignColumns: [tenderPackages.tenant_id, tenderPackages.id],
    }).onDelete('cascade'),
    vendorTenantFk: foreignKey({
      name: 'tender_vendor_profiles_vendor_tenant_fk',
      columns: [table.tenant_id, table.vendor_id],
      foreignColumns: [vendors.tenant_id, vendors.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'tender_vendor_profiles_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('no action'),
    versionCheck: check('tender_vendor_profiles_version_positive', sql`${table.version} > 0`),
  }),
)

export const tenderEvaluationScores = pgTable(
  'tender_evaluation_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    tender_id: uuid('tender_id').notNull(),
    vendor_profile_id: uuid('vendor_profile_id').notNull(),
    criterion_id: uuid('criterion_id').notNull(),
    score_bps: integer('score_bps').notNull(),
    notes: text('notes').notNull().default(''),
    reviewed_by: uuid('reviewed_by'),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_tender_evaluation_scores_tenant_id_id').on(table.tenant_id, table.id),
    identityUniqueIdx: uniqueIndex('ux_tender_evaluation_scores_profile_criterion').on(table.tenant_id, table.vendor_profile_id, table.criterion_id),
    tenderIdx: index('idx_tender_evaluation_scores_tender_id').on(table.tender_id),
    profileIdx: index('idx_tender_evaluation_scores_profile_id').on(table.vendor_profile_id),
    criterionIdx: index('idx_tender_evaluation_scores_criterion_id').on(table.criterion_id),
    tenderTenantFk: foreignKey({
      name: 'tender_evaluation_scores_tender_tenant_fk',
      columns: [table.tenant_id, table.tender_id],
      foreignColumns: [tenderPackages.tenant_id, tenderPackages.id],
    }).onDelete('cascade'),
    profileTenantFk: foreignKey({
      name: 'tender_evaluation_scores_profile_tenant_fk',
      columns: [table.tenant_id, table.vendor_profile_id],
      foreignColumns: [tenderVendorProfiles.tenant_id, tenderVendorProfiles.id],
    }).onDelete('cascade'),
    criterionTenantFk: foreignKey({
      name: 'tender_evaluation_scores_criterion_tenant_fk',
      columns: [table.tenant_id, table.criterion_id],
      foreignColumns: [tenderEvaluationCriteria.tenant_id, tenderEvaluationCriteria.id],
    }).onDelete('cascade'),
    reviewedByTenantFk: foreignKey({
      name: 'tender_evaluation_scores_reviewed_by_tenant_fk',
      columns: [table.tenant_id, table.reviewed_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('no action'),
    scoreCheck: check('tender_evaluation_scores_score_bps', sql`${table.score_bps} >= 0 and ${table.score_bps} <= 10000`),
    versionCheck: check('tender_evaluation_scores_version_positive', sql`${table.version} > 0`),
  }),
)

export type TenderPackage = typeof tenderPackages.$inferSelect
export type TenderDeviation = typeof tenderDeviations.$inferSelect
export type TenderEvaluationCriterion = typeof tenderEvaluationCriteria.$inferSelect
export type TenderVendorProfile = typeof tenderVendorProfiles.$inferSelect
export type TenderEvaluationScore = typeof tenderEvaluationScores.$inferSelect
