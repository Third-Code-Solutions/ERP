import { pgTable, uuid, varchar, text, bigint, integer, timestamp, boolean, index, uniqueIndex, jsonb, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { boms } from './boms'
import { vendors } from './vendors'
import { users } from './users'

// REFACTOR.md M3 — Tenant-scoped catalog of materials/items used to
// auto-fill BOM lines from a Togal.ai import (US-010, US-011).
export const materialItems = pgTable(
  'material_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    description: text('description').notNull(),
    category: varchar('category', { length: 120 }),
    unit: varchar('unit', { length: 32 }).notNull(), // sqm, lm, pcs, kg, etc.
    wastage_bps: integer('wastage_bps').notNull().default(0), // basis points (0-10000)
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_material_items_tenant_id').on(table.tenant_id),
    tenantCodeUq: uniqueIndex('idx_material_items_tenant_code').on(table.tenant_id, table.code),
  })
)

// Per-supplier price for a material item, with effective_from/to.
export const rateCards = pgTable(
  'rate_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    material_item_id: uuid('material_item_id').notNull().references(() => materialItems.id, { onDelete: 'cascade' }),
    vendor_id: uuid('vendor_id').references(() => vendors.id, { onDelete: 'cascade' }),
    unit_price_cents: bigint('unit_price_cents', { mode: 'number' }).notNull(),
    lead_time_days: integer('lead_time_days'),
    is_preferred: boolean('is_preferred').notNull().default(false),
    effective_from: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effective_to: timestamp('effective_to', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_rate_cards_tenant_id').on(table.tenant_id),
    materialIdx: index('idx_rate_cards_material_item').on(table.material_item_id),
    vendorIdx: index('idx_rate_cards_vendor').on(table.vendor_id),
  })
)

// Togal column → material_item mapping config (US-010).
export const mappingConfig = pgTable(
  'mapping_config',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    source_label: varchar('source_label', { length: 255 }).notNull(),
    material_item_id: uuid('material_item_id').notNull().references(() => materialItems.id, { onDelete: 'cascade' }),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_mapping_config_tenant_id').on(table.tenant_id),
    tenantLabelUq: uniqueIndex('idx_mapping_config_tenant_label').on(table.tenant_id, table.source_label),
  })
)

// Hashed one-time tokens for the public client BOM portal (US-012).
export const bomPortalTokens = pgTable(
  'bom_portal_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    bom_id: uuid('bom_id').notNull().references(() => boms.id, { onDelete: 'cascade' }),
    // SHA-256 of the URL token. Plaintext token NEVER stored.
    token_hash: varchar('token_hash', { length: 128 }).notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    used_at: timestamp('used_at', { withTimezone: true }),
    docuseal_submission_id: varchar('docuseal_submission_id', { length: 128 }),
    docuseal_slug: varchar('docuseal_slug', { length: 128 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_bom_portal_tokens_tenant_id').on(table.tenant_id),
    bomIdx: index('idx_bom_portal_tokens_bom_id').on(table.bom_id),
    tokenHashUq: uniqueIndex('idx_bom_portal_tokens_hash').on(table.token_hash),
  })
)

// RFQ status for procurement (US-013).
export const rfqStatusEnum = pgEnum('rfq_status', [
  'pending',
  'quotes_received',
  'completed',
  'cancelled',
])

export const rfqs = pgTable(
  'rfqs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    bom_id: uuid('bom_id').notNull().references(() => boms.id, { onDelete: 'cascade' }),
    status: rfqStatusEnum('status').notNull().default('pending'),
    line_items: jsonb('line_items').notNull(), // [{material_item_id, qty, unit}]
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_rfqs_tenant_id').on(table.tenant_id),
    bomIdx: index('idx_rfqs_bom_id').on(table.bom_id),
  })
)

export const rfqQuotes = pgTable(
  'rfq_quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    rfq_id: uuid('rfq_id').notNull().references(() => rfqs.id, { onDelete: 'cascade' }),
    vendor_id: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
    material_item_id: uuid('material_item_id').references(() => materialItems.id, { onDelete: 'set null' }),
    unit_price_cents: bigint('unit_price_cents', { mode: 'number' }).notNull(),
    lead_time_days: integer('lead_time_days'),
    valid_until: timestamp('valid_until', { withTimezone: true }),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    rfqIdx: index('idx_rfq_quotes_rfq_id').on(table.rfq_id),
    vendorIdx: index('idx_rfq_quotes_vendor_id').on(table.vendor_id),
  })
)

export type MaterialItem = typeof materialItems.$inferSelect
export type RateCard = typeof rateCards.$inferSelect
export type MappingConfig = typeof mappingConfig.$inferSelect
export type BomPortalToken = typeof bomPortalTokens.$inferSelect
export type Rfq = typeof rfqs.$inferSelect
export type RfqQuote = typeof rfqQuotes.$inferSelect
