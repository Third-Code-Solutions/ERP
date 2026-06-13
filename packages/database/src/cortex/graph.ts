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
import { and, eq, ilike, isNull, desc } from 'drizzle-orm'
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
