import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

// Master construction price catalogue (docs/erp/specs/catalogue.md).
// Authority is supabase/migrations/20261110100000_catalogue_price_book.sql:
// the tenant-scoped foreign keys (item, vendor, users), the trade list, the
// text-length rules and the append-only trigger live there.

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' })

export const catalogueItems = pgTable(
  'catalogue_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    trade: text('trade').notNull(),
    specification: text('specification'),
    unit: text('unit').notNull(),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    created_by: uuid('created_by'),
    // Null means "never edited by a person": only those rows are re-seeded.
    updated_by: uuid('updated_by'),
  },
  (table) => ({
    tenantCodeUnique: uniqueIndex('ux_catalogue_items_tenant_code').on(
      table.tenant_id,
      table.code,
    ),
    tenantIdUnique: uniqueIndex('ux_catalogue_items_tenant_id_id').on(
      table.tenant_id,
      table.id,
    ),
    tenantTradeIdx: index('idx_catalogue_items_tenant_trade').on(
      table.tenant_id,
      table.trade,
    ),
    nameTrgmIdx: index('idx_catalogue_items_name_trgm').using(
      'gin',
      sql`${table.name} extensions.gin_trgm_ops`,
    ),
  }),
)

// Append-only price observations. The current price of an item in a region is
// the newest row by (checked_on desc, created_at desc).
export const cataloguePrices = pgTable(
  'catalogue_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    item_id: uuid('item_id').notNull(),
    region: text('region').notNull().default('NCR'),
    // Integer centavos; the application caps them far below 2^53.
    price_low_centavos: bigint('price_low_centavos', { mode: 'number' }),
    price_avg_centavos: bigint('price_avg_centavos', { mode: 'number' }),
    price_high_centavos: bigint('price_high_centavos', { mode: 'number' }),
    price_basis: text('price_basis'),
    source_kind: text('source_kind').notNull(),
    source_name: text('source_name'),
    source_url: text('source_url'),
    vendor_id: uuid('vendor_id'),
    checked_on: date('checked_on').notNull(),
    flag: text('flag'),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    created_by: uuid('created_by'),
  },
  (table) => ({
    currentIdx: index('idx_catalogue_prices_current').on(
      table.tenant_id,
      table.item_id,
      table.region,
      table.checked_on.desc(),
      table.created_at.desc(),
    ),
    priceRange: check(
      'catalogue_prices_price_range',
      sql`(${table.price_low_centavos} is null and ${table.price_avg_centavos} is null and ${table.price_high_centavos} is null) or (${table.price_low_centavos} is not null and ${table.price_avg_centavos} is not null and ${table.price_high_centavos} is not null and ${table.price_low_centavos} >= 0 and ${table.price_low_centavos} <= ${table.price_avg_centavos} and ${table.price_avg_centavos} <= ${table.price_high_centavos})`,
    ),
    sourceKind: check(
      'catalogue_prices_source_kind_check',
      sql`${table.source_kind} in ('research', 'supplier', 'manual')`,
    ),
  }),
)

export type CatalogueItem = typeof catalogueItems.$inferSelect
export type CatalogueItemInsert = typeof catalogueItems.$inferInsert
export type CataloguePrice = typeof cataloguePrices.$inferSelect
export type CataloguePriceInsert = typeof cataloguePrices.$inferInsert
