import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

const tenantId = (name = 'tenant_id') =>
  uuid(name)
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' })

const createdAt = timestamp('created_at', { withTimezone: true })
  .notNull()
  .defaultNow()

const updatedAt = timestamp('updated_at', { withTimezone: true })
  .notNull()
  .defaultNow()

export const tenantFeatureFlags = pgTable(
  'tenant_feature_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    feature_key: varchar('feature_key', { length: 100 }).notNull(),
    enabled: boolean('enabled').notNull().default(false),
    configuration: jsonb('configuration').notNull().default({}),
    enabled_by: uuid('enabled_by'),
    enabled_at: timestamp('enabled_at', { withTimezone: true }),
    created_at: createdAt,
    updated_at: updatedAt,
  },
  (table) => ({
    tenantFeatureUnique: uniqueIndex('ux_tenant_feature_flags_key').on(
      table.tenant_id,
      table.feature_key,
    ),
    tenantIdx: index('idx_tenant_feature_flags_tenant').on(table.tenant_id),
    keyCheck: check(
      'tenant_feature_flags_key_nonempty',
      sql`length(btrim(${table.feature_key})) > 0`,
    ),
  }),
)

export const procurementRequisitions = pgTable(
  'procurement_requisitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    project_id: uuid('project_id').notNull(),
    requester_id: uuid('requester_id').notNull(),
    requisition_number: varchar('requisition_number', { length: 40 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('draft'),
    needed_by: date('needed_by'),
    purpose: text('purpose').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('PHP'),
    estimated_total_cents: bigint('estimated_total_cents', { mode: 'bigint' })
      .notNull()
      .default(0n),
    approved_by: uuid('approved_by'),
    approved_at: timestamp('approved_at', { withTimezone: true }),
    converted_purchase_order_id: uuid('converted_purchase_order_id'),
    created_at: createdAt,
    updated_at: updatedAt,
  },
  (table) => ({
    tenantIdUnique: uniqueIndex('ux_procurement_requisitions_tenant_id').on(
      table.tenant_id,
      table.id,
    ),
    numberUnique: uniqueIndex('ux_procurement_requisitions_number').on(
      table.tenant_id,
      table.requisition_number,
    ),
    statusIdx: index('idx_procurement_requisitions_status').on(
      table.tenant_id,
      table.status,
      table.created_at,
    ),
    totalCheck: check(
      'procurement_requisitions_total_check',
      sql`${table.estimated_total_cents} >= 0`,
    ),
  }),
)

export const procurementRequisitionLines = pgTable(
  'procurement_requisition_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    requisition_id: uuid('requisition_id').notNull(),
    line_number: integer('line_number').notNull(),
    description: text('description').notNull(),
    material_item_id: uuid('material_item_id'),
    bom_line_item_id: uuid('bom_line_item_id'),
    cost_code_id: uuid('cost_code_id'),
    uom_id: uuid('uom_id'),
    quantity_micros: bigint('quantity_micros', { mode: 'bigint' }).notNull(),
    estimated_unit_cost_cents: bigint('estimated_unit_cost_cents', {
      mode: 'bigint',
    })
      .notNull()
      .default(0n),
    estimated_total_cents: bigint('estimated_total_cents', { mode: 'bigint' })
      .notNull()
      .default(0n),
    selected_rfq_id: uuid('selected_rfq_id'),
    selected_quote_id: uuid('selected_quote_id'),
    created_at: createdAt,
    updated_at: updatedAt,
  },
  (table) => ({
    lineUnique: uniqueIndex('ux_procurement_requisition_lines_number').on(
      table.requisition_id,
      table.line_number,
    ),
    itemIdx: index('idx_procurement_requisition_lines_item').on(
      table.tenant_id,
      table.material_item_id,
    ),
    quantityCheck: check(
      'procurement_requisition_lines_quantity_check',
      sql`${table.quantity_micros} > 0`,
    ),
  }),
)

export const procurementRequisitionEvents = pgTable(
  'procurement_requisition_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    requisition_id: uuid('requisition_id').notNull(),
    action: varchar('action', { length: 32 }).notNull(),
    from_status: varchar('from_status', { length: 24 }),
    to_status: varchar('to_status', { length: 24 }),
    reason: text('reason'),
    actor_id: uuid('actor_id').notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: char('request_hash', { length: 64 }),
    created_at: createdAt,
  },
  (table) => ({
    idempotencyUnique: uniqueIndex(
      'ux_procurement_requisition_events_idempotency',
    ).on(table.tenant_id, table.idempotency_key),
    requisitionIdx: index('idx_procurement_requisition_events_requisition').on(
      table.tenant_id,
      table.requisition_id,
      table.created_at,
    ),
  }),
)

export const inventoryReservations = pgTable(
  'inventory_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    warehouse_id: uuid('warehouse_id').notNull(),
    material_item_id: uuid('material_item_id').notNull(),
    uom_id: uuid('uom_id').notNull(),
    project_id: uuid('project_id'),
    cost_code_id: uuid('cost_code_id'),
    po_line_item_id: uuid('po_line_item_id'),
    quantity_micros: bigint('quantity_micros', { mode: 'bigint' }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    source_type: varchar('source_type', { length: 32 })
      .notNull()
      .default('procurement_requisition'),
    source_id: uuid('source_id'),
    expires_at: timestamp('expires_at', { withTimezone: true }),
    requested_by: uuid('requested_by').notNull(),
    released_by: uuid('released_by'),
    released_at: timestamp('released_at', { withTimezone: true }),
    consumed_at: timestamp('consumed_at', { withTimezone: true }),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    created_at: createdAt,
    updated_at: updatedAt,
  },
  (table) => ({
    tenantIdUnique: uniqueIndex('ux_inventory_reservations_tenant_id').on(
      table.tenant_id,
      table.id,
    ),
    idempotencyUnique: uniqueIndex('ux_inventory_reservations_idempotency').on(
      table.tenant_id,
      table.idempotency_key,
    ),
    balanceIdx: index('idx_inventory_reservations_balance').on(
      table.tenant_id,
      table.warehouse_id,
      table.material_item_id,
      table.status,
    ),
    quantityCheck: check(
      'inventory_reservations_quantity_check',
      sql`${table.quantity_micros} > 0`,
    ),
  }),
)

export const inventoryReservationEvents = pgTable(
  'inventory_reservation_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    reservation_id: uuid('reservation_id').notNull(),
    action: varchar('action', { length: 16 }).notNull(),
    quantity_micros: bigint('quantity_micros', { mode: 'bigint' }).notNull(),
    actor_id: uuid('actor_id').notNull(),
    reason: text('reason'),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    created_at: createdAt,
  },
  (table) => ({
    idempotencyUnique: uniqueIndex(
      'ux_inventory_reservation_events_idempotency',
    ).on(table.tenant_id, table.idempotency_key),
  }),
)

export const landedCostDocuments = pgTable(
  'landed_cost_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    stock_receipt_id: uuid('stock_receipt_id').notNull(),
    document_number: varchar('document_number', { length: 80 }).notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    currency: char('currency', { length: 3 }).notNull().default('PHP'),
    total_cents: bigint('total_cents', { mode: 'bigint' }).notNull().default(0n),
    allocation_basis: varchar('allocation_basis', { length: 16 })
      .notNull()
      .default('value'),
    source_document: text('source_document'),
    created_by: uuid('created_by').notNull(),
    applied_by: uuid('applied_by'),
    applied_at: timestamp('applied_at', { withTimezone: true }),
    reversed_by: uuid('reversed_by'),
    reversed_at: timestamp('reversed_at', { withTimezone: true }),
    reversal_reason: text('reversal_reason'),
    created_at: createdAt,
    updated_at: updatedAt,
  },
  (table) => ({
    tenantIdUnique: uniqueIndex('ux_landed_cost_documents_tenant_id').on(
      table.tenant_id,
      table.id,
    ),
    numberUnique: uniqueIndex('ux_landed_cost_documents_number').on(
      table.tenant_id,
      table.document_number,
    ),
    idempotencyUnique: uniqueIndex('ux_landed_cost_documents_idempotency').on(
      table.tenant_id,
      table.idempotency_key,
    ),
    amountCheck: check(
      'landed_cost_documents_total_check',
      sql`${table.total_cents} >= 0`,
    ),
  }),
)

export const landedCostLines = pgTable(
  'landed_cost_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    landed_cost_document_id: uuid('landed_cost_document_id').notNull(),
    line_number: integer('line_number').notNull(),
    component_type: varchar('component_type', { length: 24 }).notNull(),
    description: text('description').notNull(),
    amount_cents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    created_at: createdAt,
  },
  (table) => ({
    tenantIdUnique: uniqueIndex('ux_landed_cost_lines_tenant_id').on(
      table.tenant_id,
      table.id,
    ),
    lineUnique: uniqueIndex('ux_landed_cost_lines_number').on(
      table.landed_cost_document_id,
      table.line_number,
    ),
    amountCheck: check(
      'landed_cost_lines_amount_check',
      sql`${table.amount_cents} > 0`,
    ),
  }),
)

export const landedCostAllocations = pgTable(
  'landed_cost_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    landed_cost_document_id: uuid('landed_cost_document_id').notNull(),
    landed_cost_line_id: uuid('landed_cost_line_id').notNull(),
    stock_receipt_line_id: uuid('stock_receipt_line_id').notNull(),
    allocation_basis_value: bigint('allocation_basis_value', {
      mode: 'bigint',
    }).notNull(),
    allocated_cents: bigint('allocated_cents', { mode: 'bigint' }).notNull(),
    created_at: createdAt,
  },
  (table) => ({
    lineReceiptUnique: uniqueIndex(
      'ux_landed_cost_allocations_line_receipt',
    ).on(table.landed_cost_line_id, table.stock_receipt_line_id),
    basisCheck: check(
      'landed_cost_allocations_basis_check',
      sql`${table.allocation_basis_value} > 0`,
    ),
  }),
)

export const priceLists = pgTable(
  'price_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    vendor_id: uuid('vendor_id'),
    currency: char('currency', { length: 3 }).notNull().default('PHP'),
    valid_from: date('valid_from').notNull(),
    valid_to: date('valid_to'),
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    source: varchar('source', { length: 32 }).notNull().default('manual'),
    created_by: uuid('created_by').notNull(),
    approved_by: uuid('approved_by'),
    approved_at: timestamp('approved_at', { withTimezone: true }),
    created_at: createdAt,
    updated_at: updatedAt,
  },
  (table) => ({
    tenantIdUnique: uniqueIndex('ux_price_lists_tenant_id').on(
      table.tenant_id,
      table.id,
    ),
    codeUnique: uniqueIndex('ux_price_lists_code').on(
      table.tenant_id,
      table.code,
    ),
  }),
)

export const priceListItems = pgTable(
  'price_list_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    price_list_id: uuid('price_list_id').notNull(),
    material_item_id: uuid('material_item_id').notNull(),
    uom_id: uuid('uom_id').notNull(),
    minimum_quantity_micros: bigint('minimum_quantity_micros', {
      mode: 'bigint',
    })
      .notNull()
      .default(1n),
    unit_price_cents: bigint('unit_price_cents', { mode: 'bigint' }).notNull(),
    lead_time_days: integer('lead_time_days'),
    source_reference: text('source_reference'),
    created_at: createdAt,
  },
  (table) => ({
    tierUnique: uniqueIndex('ux_price_list_items_tier').on(
      table.price_list_id,
      table.material_item_id,
      table.uom_id,
      table.minimum_quantity_micros,
    ),
    priceCheck: check(
      'price_list_items_price_check',
      sql`${table.unit_price_cents} >= 0`,
    ),
  }),
)

export const tenantCurrencies = pgTable(
  'tenant_currencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    currency_code: char('currency_code', { length: 3 }).notNull(),
    decimal_places: smallint('decimal_places').notNull().default(2),
    is_base: boolean('is_base').notNull().default(false),
    is_active: boolean('is_active').notNull().default(true),
    created_by: uuid('created_by').notNull(),
    created_at: createdAt,
  },
  (table) => ({
    currencyUnique: uniqueIndex('ux_tenant_currencies_code').on(
      table.tenant_id,
      table.currency_code,
    ),
    baseUnique: uniqueIndex('ux_tenant_currencies_base')
      .on(table.tenant_id)
      .where(sql`${table.is_base}`),
  }),
)

export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    from_currency: char('from_currency', { length: 3 }).notNull(),
    to_currency: char('to_currency', { length: 3 }).notNull(),
    rate_numerator: bigint('rate_numerator', { mode: 'bigint' }).notNull(),
    rate_denominator: bigint('rate_denominator', { mode: 'bigint' }).notNull(),
    effective_on: date('effective_on').notNull(),
    source: varchar('source', { length: 64 }).notNull(),
    approved_by: uuid('approved_by'),
    approved_at: timestamp('approved_at', { withTimezone: true }),
    created_by: uuid('created_by').notNull(),
    created_at: createdAt,
  },
  (table) => ({
    effectiveUnique: uniqueIndex('ux_exchange_rates_effective').on(
      table.tenant_id,
      table.from_currency,
      table.to_currency,
      table.effective_on,
    ),
    ratioCheck: check(
      'exchange_rates_ratio_check',
      sql`${table.rate_numerator} > 0 and ${table.rate_denominator} > 0`,
    ),
  }),
)

export const taxProfiles = pgTable(
  'tax_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    valid_from: date('valid_from').notNull(),
    valid_to: date('valid_to'),
    vat_rate_bps: integer('vat_rate_bps').notNull().default(1200),
    withholding_rate_bps: integer('withholding_rate_bps').notNull().default(200),
    retention_rate_bps: integer('retention_rate_bps').notNull().default(0),
    vat_registered: boolean('vat_registered').notNull().default(true),
    bir_form_version: varchar('bir_form_version', { length: 40 }),
    statutory_configuration: jsonb('statutory_configuration')
      .notNull()
      .default({}),
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    created_by: uuid('created_by').notNull(),
    approved_by: uuid('approved_by'),
    approved_at: timestamp('approved_at', { withTimezone: true }),
    created_at: createdAt,
    updated_at: updatedAt,
  },
  (table) => ({
    codeUnique: uniqueIndex('ux_tax_profiles_code').on(
      table.tenant_id,
      table.code,
    ),
    tenantIdUnique: uniqueIndex('ux_tax_profiles_tenant_id').on(
      table.tenant_id,
      table.id,
    ),
    ratesCheck: check(
      'tax_profiles_rates_check',
      sql`${table.vat_rate_bps} between 0 and 10000 and ${table.withholding_rate_bps} between 0 and 10000 and ${table.retention_rate_bps} between 0 and 10000`,
    ),
  }),
)

export const statutoryOutputs = pgTable(
  'statutory_outputs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    tax_profile_id: uuid('tax_profile_id').notNull(),
    document_type: varchar('document_type', { length: 40 }).notNull(),
    document_id: uuid('document_id').notNull(),
    output_type: varchar('output_type', { length: 40 }).notNull(),
    template_version: varchar('template_version', { length: 40 }).notNull(),
    payload: jsonb('payload').notNull(),
    content_hash: varchar('content_hash', { length: 64 }).notNull(),
    generated_by: uuid('generated_by').notNull(),
    generated_at: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    documentUnique: uniqueIndex('ux_statutory_outputs_document').on(
      table.tenant_id,
      table.document_type,
      table.document_id,
      table.output_type,
      table.template_version,
    ),
  }),
)

export const fiscalPeriodCloseRuns = pgTable(
  'fiscal_period_close_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    fiscal_period_id: uuid('fiscal_period_id').notNull(),
    status: varchar('status', { length: 16 }).notNull().default('blocked'),
    checks: jsonb('checks').notNull().default([]),
    blocking_count: integer('blocking_count').notNull().default(0),
    run_by: uuid('run_by').notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    created_at: createdAt,
  },
  (table) => ({
    idempotencyUnique: uniqueIndex(
      'ux_fiscal_period_close_runs_idempotency',
    ).on(table.tenant_id, table.idempotency_key),
    periodIdx: index('idx_fiscal_period_close_runs_period').on(
      table.tenant_id,
      table.fiscal_period_id,
      table.created_at,
    ),
  }),
)

export const sapPostingOutbox = pgTable(
  'sap_posting_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    aggregate_type: varchar('aggregate_type', { length: 40 }).notNull(),
    aggregate_id: uuid('aggregate_id').notNull(),
    posting_type: varchar('posting_type', { length: 24 }).notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    payload: jsonb('payload').notNull(),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    attempt_count: integer('attempt_count').notNull().default(0),
    next_attempt_at: timestamp('next_attempt_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    provider_document_id: varchar('provider_document_id', { length: 120 }),
    last_error: text('last_error'),
    posted_at: timestamp('posted_at', { withTimezone: true }),
    created_by: uuid('created_by').notNull(),
    created_at: createdAt,
    updated_at: updatedAt,
  },
  (table) => ({
    tenantIdUnique: uniqueIndex('ux_sap_posting_outbox_tenant_id').on(
      table.tenant_id,
      table.id,
    ),
    idempotencyUnique: uniqueIndex('ux_sap_posting_outbox_idempotency').on(
      table.tenant_id,
      table.idempotency_key,
    ),
    pendingIdx: index('idx_sap_posting_outbox_pending').on(
      table.status,
      table.next_attempt_at,
    ),
  }),
)

export const sapPostingAttempts = pgTable(
  'sap_posting_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    sap_posting_id: uuid('sap_posting_id').notNull(),
    attempt_number: integer('attempt_number').notNull(),
    outcome: varchar('outcome', { length: 16 }).notNull(),
    provider_status: integer('provider_status'),
    response: jsonb('response'),
    error: text('error'),
    created_at: createdAt,
  },
  (table) => ({
    attemptUnique: uniqueIndex('ux_sap_posting_attempts_number').on(
      table.sap_posting_id,
      table.attempt_number,
    ),
  }),
)

export const providerDeliveryOutbox = pgTable(
  'provider_delivery_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    channel: varchar('channel', { length: 8 }).notNull(),
    provider: varchar('provider', { length: 32 }).notNull(),
    event_type: varchar('event_type', { length: 100 }).notNull(),
    aggregate_type: varchar('aggregate_type', { length: 64 }).notNull(),
    aggregate_id: uuid('aggregate_id').notNull(),
    recipient: varchar('recipient', { length: 320 }).notNull(),
    subject: varchar('subject', { length: 255 }),
    body: text('body').notNull(),
    payload: jsonb('payload').notNull().default({}),
    template_version: varchar('template_version', { length: 40 }).notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    attempt_count: integer('attempt_count').notNull().default(0),
    next_attempt_at: timestamp('next_attempt_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    provider_message_id: varchar('provider_message_id', { length: 255 }),
    provider_response_code: integer('provider_response_code'),
    provider_response_hash: varchar('provider_response_hash', { length: 64 }),
    last_error: text('last_error'),
    delivered_at: timestamp('delivered_at', { withTimezone: true }),
    dead_lettered_at: timestamp('dead_lettered_at', { withTimezone: true }),
    created_by: uuid('created_by').notNull(),
    created_at: createdAt,
    updated_at: updatedAt,
  },
  (table) => ({
    tenantIdUnique: uniqueIndex('ux_provider_delivery_outbox_tenant_id').on(
      table.tenant_id,
      table.id,
    ),
    idempotencyUnique: uniqueIndex(
      'ux_provider_delivery_outbox_idempotency',
    ).on(table.tenant_id, table.idempotency_key),
    pendingIdx: index('idx_provider_delivery_outbox_pending').on(
      table.status,
      table.next_attempt_at,
    ),
  }),
)

export const providerDeliveryAttempts = pgTable(
  'provider_delivery_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    delivery_id: uuid('delivery_id').notNull(),
    attempt_number: integer('attempt_number').notNull(),
    outcome: varchar('outcome', { length: 16 }).notNull(),
    provider_status: integer('provider_status'),
    response_hash: varchar('response_hash', { length: 64 }),
    error: text('error'),
    created_at: createdAt,
  },
  (table) => ({
    attemptUnique: uniqueIndex('ux_provider_delivery_attempts_number').on(
      table.delivery_id,
      table.attempt_number,
    ),
  }),
)

export const roadmapWorkflowEvents = pgTable(
  'roadmap_workflow_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: tenantId(),
    entity_type: varchar('entity_type', { length: 40 }).notNull(),
    entity_id: uuid('entity_id').notNull(),
    action: varchar('action', { length: 32 }).notNull(),
    from_status: varchar('from_status', { length: 24 }),
    to_status: varchar('to_status', { length: 24 }),
    payload: jsonb('payload').notNull().default({}),
    actor_id: uuid('actor_id').notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    created_at: createdAt,
  },
  (table) => ({
    idempotencyUnique: uniqueIndex('ux_roadmap_workflow_events_idempotency').on(
      table.tenant_id,
      table.idempotency_key,
    ),
    entityIdx: index('idx_roadmap_workflow_events_entity').on(
      table.tenant_id,
      table.entity_type,
      table.entity_id,
      table.created_at,
    ),
  }),
)

export type TenantFeatureFlag = typeof tenantFeatureFlags.$inferSelect
export type ProcurementRequisition = typeof procurementRequisitions.$inferSelect
export type ProcurementRequisitionLine =
  typeof procurementRequisitionLines.$inferSelect
export type ProcurementRequisitionEvent =
  typeof procurementRequisitionEvents.$inferSelect
export type InventoryReservation = typeof inventoryReservations.$inferSelect
export type InventoryReservationEvent =
  typeof inventoryReservationEvents.$inferSelect
export type LandedCostDocument = typeof landedCostDocuments.$inferSelect
export type LandedCostLine = typeof landedCostLines.$inferSelect
export type LandedCostAllocation = typeof landedCostAllocations.$inferSelect
export type PriceList = typeof priceLists.$inferSelect
export type PriceListItem = typeof priceListItems.$inferSelect
export type TenantCurrency = typeof tenantCurrencies.$inferSelect
export type ExchangeRate = typeof exchangeRates.$inferSelect
export type TaxProfile = typeof taxProfiles.$inferSelect
export type StatutoryOutput = typeof statutoryOutputs.$inferSelect
export type FiscalPeriodCloseRun = typeof fiscalPeriodCloseRuns.$inferSelect
export type SapPostingOutbox = typeof sapPostingOutbox.$inferSelect
export type SapPostingAttempt = typeof sapPostingAttempts.$inferSelect
export type ProviderDeliveryOutbox = typeof providerDeliveryOutbox.$inferSelect
export type ProviderDeliveryAttempt = typeof providerDeliveryAttempts.$inferSelect
export type RoadmapWorkflowEvent = typeof roadmapWorkflowEvents.$inferSelect
