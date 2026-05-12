import { pgTable, uuid, varchar, text, integer, timestamp, boolean, index, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { projects } from './projects'
import { accounts } from './accounts'
import { users } from './users'
import { documents } from './documents'

// REFACTOR.md M7 US-WA-001..US-WA-003 — Warranty tickets + CNPS.
export const ticketStatusEnum = pgEnum('ticket_status', [
  'open',
  'acknowledged',
  'scheduled',
  'in_progress',
  'closed',
  'cancelled',
])

export const ticketCategoryEnum = pgEnum('ticket_category', [
  'civil',
  'electrical',
  'plumbing',
  'mep',
  'finishes',
  'fixtures',
  'other',
])

export const warrantyTickets = pgTable(
  'warranty_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    account_id: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    ticket_number: varchar('ticket_number', { length: 32 }).notNull(),
    category: ticketCategoryEnum('category').notNull().default('other'),
    description: text('description').notNull(),
    location: varchar('location', { length: 255 }),
    status: ticketStatusEnum('status').notNull().default('open'),
    submitted_by_name: varchar('submitted_by_name', { length: 255 }),
    submitted_by_email: varchar('submitted_by_email', { length: 255 }),
    acknowledged_at: timestamp('acknowledged_at', { withTimezone: true }),
    scheduled_at: timestamp('scheduled_at', { withTimezone: true }),
    closed_at: timestamp('closed_at', { withTimezone: true }),
    sla_breached_ack: boolean('sla_breached_ack').notNull().default(false),
    sla_breached_schedule: boolean('sla_breached_schedule').notNull().default(false),
    service_report_document_id: uuid('service_report_document_id').references(() => documents.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_warranty_tickets_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_warranty_tickets_project_id').on(table.project_id),
    tenantStatusIdx: index('idx_warranty_tickets_tenant_status').on(table.tenant_id, table.status),
    tenantNumberUq: uniqueIndex('idx_warranty_tickets_tenant_number').on(table.tenant_id, table.ticket_number),
  })
)

export const ticketMessages = pgTable(
  'ticket_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    ticket_id: uuid('ticket_id').notNull().references(() => warrantyTickets.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    is_internal: boolean('is_internal').notNull().default(false),
    sender_user_id: uuid('sender_user_id').references(() => users.id, { onDelete: 'set null' }),
    sender_name: varchar('sender_name', { length: 255 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ticketIdx: index('idx_ticket_messages_ticket').on(table.ticket_id, table.created_at),
  })
)

export const warrantyPortalTokens = pgTable(
  'warranty_portal_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    token_hash: varchar('token_hash', { length: 128 }).notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashUq: uniqueIndex('idx_warranty_portal_tokens_hash').on(table.token_hash),
  })
)

export const cnpsSurveys = pgTable(
  'cnps_surveys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    ticket_id: uuid('ticket_id').notNull().references(() => warrantyTickets.id, { onDelete: 'cascade' }),
    account_id: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    score: integer('score'), // 0-10
    comment: text('comment'),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    responded_at: timestamp('responded_at', { withTimezone: true }),
    response_token_hash: varchar('response_token_hash', { length: 128 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_cnps_tenant_id').on(table.tenant_id),
    ticketIdx: index('idx_cnps_ticket_id').on(table.ticket_id),
    accountIdx: index('idx_cnps_account_id').on(table.account_id),
  })
)

export type WarrantyTicket = typeof warrantyTickets.$inferSelect
export type TicketMessage = typeof ticketMessages.$inferSelect
export type WarrantyPortalToken = typeof warrantyPortalTokens.$inferSelect
export type CnpsSurvey = typeof cnpsSurveys.$inferSelect
