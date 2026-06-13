import {
  pgTable,
  pgEnum,
  uuid,
  bigserial,
  bigint,
  varchar,
  text,
  jsonb,
  timestamp,
  real,
  index,
  customType,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'

// -----------------------------------------------------------------------------
// Cortex graph substrate (BUILDOPS_IMPLEMENTATION_PROMPT §5, Appendix B).
//
// The canonical data lives in the ERP tables (single source of truth). These
// three tables are a DERIVED, permissioned, queryable projection kept live by
// ERP mutation events (Postgres triggers — see sql/cortex-substrate.sql).
// Every node/edge is tenant-scoped (RLS), bi-temporal (valid_from/valid_to +
// recorded_at), and provenance-tracked (hash-chained cortex_provenance).
// -----------------------------------------------------------------------------

// pgvector column (mirrors embeddings.ts — RLS-scoped semantic retrieval).
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

// Node type catalog — Appendix B. Typed, not free text.
export const cortexNodeTypeEnum = pgEnum('cortex_node_type', [
  'employee',
  'project',
  'opportunity',
  'account',
  'scope_item',
  'bom',
  'bom_line',
  'vendor',
  'purchase_order',
  'po_line',
  'invoice',
  'invoice_line',
  'milestone',
  'cost_line',
  'task',
  'announcement',
  'schedule_event',
  'document',
  'change_order',
  'audit_event',
])

// Edge type catalog — Appendix B.
export const cortexEdgeTypeEnum = pgEnum('cortex_edge_type', [
  'owns',
  'assigned_to',
  'member_of',
  'part_of',
  'derived_from',
  'bills',
  'supplies',
  'pays',
  'blocks',
  'depends_on',
  'mentions',
  'scheduled_for',
  'approved_by',
  'superseded_by',
  'references_doc',
])

// How an edge came to exist — keeps machine-derived links distinguishable from
// canonical FK-derived links and AI-extracted ones (§5 mandate).
export const cortexEdgeOriginEnum = pgEnum('cortex_edge_origin', [
  'canonical', // derived directly from an ERP foreign key
  'derived', // computed/inferred from ERP state
  'ai', // extracted by a Cortex agent (carries confidence < 1)
])

// Provenance subject + origin (§5 substrate).
export const cortexSubjectKindEnum = pgEnum('cortex_subject_kind', [
  'node',
  'edge',
  'answer',
])

export const cortexProvenanceOriginEnum = pgEnum('cortex_provenance_origin', [
  'mutation', // an ERP table mutation (trigger)
  'document', // ingested from a document
  'ai_run', // produced by a Cortex agent run
  'import', // bulk import / backfill
])

export const cortexFreshnessEnum = pgEnum('cortex_freshness', [
  'fresh',
  'stale',
  'unknown',
])

// -----------------------------------------------------------------------------
// cortex_nodes — one current row per ERP entity (plus bi-temporal history).
// -----------------------------------------------------------------------------
export const cortexNodes = pgTable(
  'cortex_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    node_type: cortexNodeTypeEnum('node_type').notNull(),
    // Pointer back to the canonical ERP row (source of truth).
    ref_table: varchar('ref_table', { length: 100 }).notNull(),
    ref_id: uuid('ref_id').notNull(),
    title: varchar('title', { length: 500 }),
    summary: text('summary'),
    attributes: jsonb('attributes'),
    // Bi-temporal: business validity.
    valid_from: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    valid_to: timestamp('valid_to', { withTimezone: true }),
    // Bi-temporal: when the system recorded it.
    recorded_at: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    // Staleness tracking.
    last_verified_at: timestamp('last_verified_at', { withTimezone: true }),
    freshness: cortexFreshnessEnum('freshness').notNull().default('fresh'),
    // Semantic retrieval (1536-dim, text-embedding-3-small).
    embedding: vector('embedding', 1536),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_cortex_nodes_tenant_id').on(table.tenant_id),
    typeIdx: index('idx_cortex_nodes_tenant_type').on(table.tenant_id, table.node_type),
    refIdx: index('idx_cortex_nodes_ref').on(table.tenant_id, table.ref_table, table.ref_id),
  })
)

// -----------------------------------------------------------------------------
// cortex_edges — typed relationships, machine-derived from ERP FKs + AI.
// -----------------------------------------------------------------------------
export const cortexEdges = pgTable(
  'cortex_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    src_id: uuid('src_id')
      .notNull()
      .references(() => cortexNodes.id, { onDelete: 'cascade' }),
    dst_id: uuid('dst_id')
      .notNull()
      .references(() => cortexNodes.id, { onDelete: 'cascade' }),
    edge_type: cortexEdgeTypeEnum('edge_type').notNull(),
    origin: cortexEdgeOriginEnum('origin').notNull().default('canonical'),
    weight: real('weight').notNull().default(1),
    confidence: real('confidence').notNull().default(1),
    attributes: jsonb('attributes'),
    valid_from: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    valid_to: timestamp('valid_to', { withTimezone: true }),
    recorded_at: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    // Points at the cortex_provenance row that explains this edge (nullable).
    provenance_id: bigint('provenance_id', { mode: 'number' }).references(
      () => cortexProvenance.id,
      { onDelete: 'set null' }
    ),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_cortex_edges_tenant_id').on(table.tenant_id),
    srcIdx: index('idx_cortex_edges_src').on(table.src_id, table.edge_type),
    dstIdx: index('idx_cortex_edges_dst').on(table.dst_id, table.edge_type),
  })
)

// -----------------------------------------------------------------------------
// cortex_provenance — append-only, hash-chained per tenant (mirrors audit_log).
// Records WHY a node/edge/answer exists: which mutation/document/AI run/import,
// which actor, and a SHA256 chain so history cannot be rewritten.
// -----------------------------------------------------------------------------
export const cortexProvenance = pgTable(
  'cortex_provenance',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    subject_kind: cortexSubjectKindEnum('subject_kind').notNull(),
    subject_id: uuid('subject_id'),
    origin: cortexProvenanceOriginEnum('origin').notNull(),
    origin_ref: text('origin_ref'),
    actor_id: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    prev_hash: varchar('prev_hash', { length: 64 }).notNull().default('genesis'),
    hash: varchar('hash', { length: 64 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_cortex_provenance_tenant_id').on(table.tenant_id),
    subjectIdx: index('idx_cortex_provenance_subject').on(table.subject_kind, table.subject_id),
    tenantCreatedIdx: index('idx_cortex_provenance_tenant_created').on(
      table.tenant_id,
      table.id
    ),
  })
)

export type CortexNode = typeof cortexNodes.$inferSelect
export type CortexNodeInsert = typeof cortexNodes.$inferInsert
export type CortexEdge = typeof cortexEdges.$inferSelect
export type CortexEdgeInsert = typeof cortexEdges.$inferInsert
export type CortexProvenance = typeof cortexProvenance.$inferSelect
export type CortexProvenanceInsert = typeof cortexProvenance.$inferInsert
