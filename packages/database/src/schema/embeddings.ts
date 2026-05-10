import { pgTable, uuid, varchar, text, integer, timestamp, index, customType } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

// pgvector column type. Wire format on the way in is the textual form
// `[1.0,2.0,...]`; on the way out, postgres.js returns the same.
const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`
    },
    fromDriver(value: string): number[] {
      return JSON.parse(value) as number[]
    },
  })(name)

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
    // pgvector column — 1536 dim for text-embedding-3-small
    embedding: vector('embedding', 1536),
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
