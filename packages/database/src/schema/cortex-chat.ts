import { pgTable, pgEnum, uuid, varchar, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'

// -----------------------------------------------------------------------------
// BuildOps Agent memory — persists every Cortex conversation in the user's DB
// (tenant-scoped), so the AI Brain has a durable, auditable memory surfaced in
// the dashboard. One conversation per thread; messages are append-only turns.
// -----------------------------------------------------------------------------

export const cortexMessageRoleEnum = pgEnum('cortex_message_role', [
  'user',
  'assistant',
  'system',
])

export const cortexConversations = pgTable(
  'cortex_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantUserIdx: index('idx_cortex_conversations_tenant_user').on(
      table.tenant_id,
      table.user_id,
      table.updated_at
    ),
  })
)

export const cortexMessages = pgTable(
  'cortex_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversation_id: uuid('conversation_id')
      .notNull()
      .references(() => cortexConversations.id, { onDelete: 'cascade' }),
    role: cortexMessageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    // Cited graph node refs / sources backing an assistant turn.
    citations: jsonb('citations'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    convoIdx: index('idx_cortex_messages_conversation').on(
      table.conversation_id,
      table.created_at
    ),
    tenantIdx: index('idx_cortex_messages_tenant').on(table.tenant_id),
  })
)

export type CortexConversation = typeof cortexConversations.$inferSelect
export type CortexConversationInsert = typeof cortexConversations.$inferInsert
export type CortexMessage = typeof cortexMessages.$inferSelect
export type CortexMessageInsert = typeof cortexMessages.$inferInsert
