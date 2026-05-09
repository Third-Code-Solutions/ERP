import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'

// Stores OpenAI text-embedding-3-small vectors (1536 dimensions) for semantic search.
// Requires pgvector extension: CREATE EXTENSION IF NOT EXISTS vector;
export const embeddings = pgTable(
  'embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    entity_type: varchar('entity_type', { length: 100 }).notNull(),
    entity_id: uuid('entity_id').notNull(),
    // Chunk info for long documents
    chunk_index: integer('chunk_index').notNull().default(0),
    chunk_text: text('chunk_text').notNull(),
    // pgvector column: vector(1536) - stored as raw SQL type
    embedding: text('embedding'),
    model: varchar('model', { length: 100 }).notNull().default('text-embedding-3-small'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_embeddings_tenant_id').on(table.tenant_id),
    entityIdx: index('idx_embeddings_entity').on(table.entity_type, table.entity_id),
  })
)

export type Embedding = typeof embeddings.$inferSelect
export type EmbeddingInsert = typeof embeddings.$inferInsert
