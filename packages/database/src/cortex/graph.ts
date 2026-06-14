/**
 * Cortex graph read API (tenant-scoped).
 *
 * The Drizzle client connects as the `postgres` role, which BYPASSES RLS, so
 * EVERY query here MUST filter by `tenant_id` explicitly. `tenantId` must come
 * from the caller's authenticated session — never from request input. This is
 * the same discipline the rest of the SSR data layer follows
 * (see docs/runbooks/tenant-isolation.md).
 *
 * These read helpers are the foundation the Phase-4 Cortex agents (Atlas, Pulse,
 * Herald, …) build on: an agent answer can only ever include nodes the caller
 * may read, because retrieval is tenant-scoped at the source.
 */
import { and, eq, ilike, isNull, isNotNull, desc, sql, type SQL } from 'drizzle-orm'
import { db } from '../client'
import {
  cortexNodes,
  cortexEdges,
  cortexProvenance,
  type CortexNode,
  type CortexProvenance,
} from '../schema/cortex'

export interface CortexNeighbor {
  edgeId: string
  edgeType: string
  direction: 'out' | 'in'
  origin: string
  confidence: number
  node: CortexNode
}

const DEFAULT_LIMIT = 50

/** The current (non-superseded) graph node for a canonical ERP row, or null. */
export async function getCortexNodeByRef(
  tenantId: string,
  refTable: string,
  refId: string
): Promise<CortexNode | null> {
  const rows = await db
    .select()
    .from(cortexNodes)
    .where(
      and(
        eq(cortexNodes.tenant_id, tenantId),
        eq(cortexNodes.ref_table, refTable),
        eq(cortexNodes.ref_id, refId),
        isNull(cortexNodes.valid_to)
      )
    )
    .orderBy(desc(cortexNodes.recorded_at))
    .limit(1)
  return rows[0] ?? null
}

/** List current nodes for a tenant, optionally filtered by type and title text. */
export async function searchCortexNodes(
  tenantId: string,
  opts: { nodeType?: CortexNode['node_type']; query?: string; limit?: number } = {}
): Promise<CortexNode[]> {
  const filters = [eq(cortexNodes.tenant_id, tenantId), isNull(cortexNodes.valid_to)]
  if (opts.nodeType) filters.push(eq(cortexNodes.node_type, opts.nodeType))
  if (opts.query) filters.push(ilike(cortexNodes.title, `%${opts.query}%`))
  return db
    .select()
    .from(cortexNodes)
    .where(and(...filters))
    .orderBy(desc(cortexNodes.recorded_at))
    .limit(opts.limit ?? DEFAULT_LIMIT)
}

/**
 * Current neighbors of a node (both directions), with the connecting edge.
 * Tenant-scoped on both the edge and the joined node.
 */
export async function getCortexNeighbors(
  tenantId: string,
  nodeId: string,
  opts: { limit?: number } = {}
): Promise<CortexNeighbor[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT

  const outgoing = await db
    .select({ edge: cortexEdges, node: cortexNodes })
    .from(cortexEdges)
    .innerJoin(cortexNodes, eq(cortexEdges.dst_id, cortexNodes.id))
    .where(
      and(
        eq(cortexEdges.tenant_id, tenantId),
        eq(cortexEdges.src_id, nodeId),
        isNull(cortexEdges.valid_to),
        isNull(cortexNodes.valid_to)
      )
    )
    .limit(limit)

  const incoming = await db
    .select({ edge: cortexEdges, node: cortexNodes })
    .from(cortexEdges)
    .innerJoin(cortexNodes, eq(cortexEdges.src_id, cortexNodes.id))
    .where(
      and(
        eq(cortexEdges.tenant_id, tenantId),
        eq(cortexEdges.dst_id, nodeId),
        isNull(cortexEdges.valid_to),
        isNull(cortexNodes.valid_to)
      )
    )
    .limit(limit)

  const map = (
    rows: Array<{ edge: typeof cortexEdges.$inferSelect; node: CortexNode }>,
    direction: 'out' | 'in'
  ): CortexNeighbor[] =>
    rows.map((r) => ({
      edgeId: r.edge.id,
      edgeType: r.edge.edge_type,
      direction,
      origin: r.edge.origin,
      confidence: r.edge.confidence,
      node: r.node,
    }))

  return [...map(outgoing, 'out'), ...map(incoming, 'in')]
}

export interface SemanticHit {
  node: CortexNode
  distance: number
}

export interface CortexGraphData {
  nodes: { id: string; type: string; title: string | null; refTable: string; refId: string }[]
  links: { source: string; target: string; type: string }[]
}

/**
 * Whole-graph fetch for the interactive visualization. Tenant-scoped and
 * capped for performance: at most `nodeLimit` current nodes, and only edges
 * whose endpoints are both in that node set (no dangling links).
 */
export async function getCortexGraph(
  tenantId: string,
  nodeLimit = 1500
): Promise<CortexGraphData> {
  const nodeRows = await db
    .select({
      id: cortexNodes.id,
      type: cortexNodes.node_type,
      title: cortexNodes.title,
      refTable: cortexNodes.ref_table,
      refId: cortexNodes.ref_id,
    })
    .from(cortexNodes)
    .where(and(eq(cortexNodes.tenant_id, tenantId), isNull(cortexNodes.valid_to)))
    .orderBy(desc(cortexNodes.recorded_at))
    .limit(nodeLimit)

  const ids = new Set(nodeRows.map((n) => n.id))

  const edgeRows = await db
    .select({
      source: cortexEdges.src_id,
      target: cortexEdges.dst_id,
      type: cortexEdges.edge_type,
    })
    .from(cortexEdges)
    .where(and(eq(cortexEdges.tenant_id, tenantId), isNull(cortexEdges.valid_to)))
    .limit(nodeLimit * 8)

  const links = edgeRows.filter((e) => ids.has(e.source) && ids.has(e.target))

  return { nodes: nodeRows, links }
}

export interface CortexGraphStats {
  nodes: number
  edges: number
  provenance: number
  byType: { nodeType: string; count: number }[]
}

/** High-level counts for a tenant's graph — powers the Cortex dashboard. */
export async function getCortexGraphStats(tenantId: string): Promise<CortexGraphStats> {
  const [nodeRows, edgeRows, provRows, typeRows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(cortexNodes)
      .where(and(eq(cortexNodes.tenant_id, tenantId), isNull(cortexNodes.valid_to))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(cortexEdges)
      .where(and(eq(cortexEdges.tenant_id, tenantId), isNull(cortexEdges.valid_to))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(cortexProvenance)
      .where(eq(cortexProvenance.tenant_id, tenantId)),
    db
      .select({ nodeType: cortexNodes.node_type, count: sql<number>`count(*)::int` })
      .from(cortexNodes)
      .where(and(eq(cortexNodes.tenant_id, tenantId), isNull(cortexNodes.valid_to)))
      .groupBy(cortexNodes.node_type)
      .orderBy(desc(sql`count(*)`)),
  ])

  return {
    nodes: Number(nodeRows[0]?.n ?? 0),
    edges: Number(edgeRows[0]?.n ?? 0),
    provenance: Number(provRows[0]?.n ?? 0),
    byType: typeRows.map((r) => ({ nodeType: r.nodeType, count: Number(r.count) })),
  }
}

/** Current nodes for a tenant that still lack an embedding (population queue). */
export async function getUnembeddedCortexNodes(
  tenantId: string,
  limit = 100
): Promise<CortexNode[]> {
  return db
    .select()
    .from(cortexNodes)
    .where(
      and(
        eq(cortexNodes.tenant_id, tenantId),
        isNull(cortexNodes.valid_to),
        isNull(cortexNodes.embedding)
      )
    )
    .orderBy(desc(cortexNodes.recorded_at))
    .limit(limit)
}

/** Format a JS vector for pgvector's text wire format. */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

/**
 * Write (or refresh) a node's embedding. Tenant-scoped so a caller can only
 * touch their own tenant's nodes even though Drizzle runs as `postgres`.
 */
export async function setCortexNodeEmbedding(
  tenantId: string,
  nodeId: string,
  embedding: number[]
): Promise<void> {
  await db
    .update(cortexNodes)
    .set({ embedding, last_verified_at: new Date() })
    .where(and(eq(cortexNodes.tenant_id, tenantId), eq(cortexNodes.id, nodeId)))
}

/**
 * Semantic (vector) search over the graph — pgvector cosine distance, ascending
 * (nearest first). Tenant-scoped; only current nodes that actually have an
 * embedding participate. This is the vector arm of Cortex hybrid retrieval.
 */
export async function cortexSemanticSearch(
  tenantId: string,
  embedding: number[],
  opts: { nodeType?: CortexNode['node_type']; limit?: number } = {}
): Promise<SemanticHit[]> {
  const vec = toVectorLiteral(embedding)
  const distance = sql<number>`${cortexNodes.embedding} <=> ${vec}::vector`

  const filters: (SQL | undefined)[] = [
    eq(cortexNodes.tenant_id, tenantId),
    isNull(cortexNodes.valid_to),
    isNotNull(cortexNodes.embedding),
  ]
  if (opts.nodeType) filters.push(eq(cortexNodes.node_type, opts.nodeType))

  const rows = await db
    .select({ node: cortexNodes, distance })
    .from(cortexNodes)
    .where(and(...filters))
    .orderBy(distance)
    .limit(opts.limit ?? 10)

  return rows.map((r) => ({ node: r.node, distance: Number(r.distance) }))
}

/** Provenance trail for a node/edge/answer, newest first (audit-grade). */
export async function getCortexProvenance(
  tenantId: string,
  subjectKind: CortexProvenance['subject_kind'],
  subjectId: string,
  limit = DEFAULT_LIMIT
): Promise<CortexProvenance[]> {
  return db
    .select()
    .from(cortexProvenance)
    .where(
      and(
        eq(cortexProvenance.tenant_id, tenantId),
        eq(cortexProvenance.subject_kind, subjectKind),
        eq(cortexProvenance.subject_id, subjectId)
      )
    )
    .orderBy(desc(cortexProvenance.id))
    .limit(limit)
}
