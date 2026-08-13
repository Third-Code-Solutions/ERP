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
import { and, or, eq, inArray, ilike, isNull, isNotNull, desc, sql, type SQL } from 'drizzle-orm'
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


export interface CortexCitationNode {
  id: string
  node_type: CortexNode['node_type']
  ref_table: string
  ref_id: string
  title: string | null
  projectId: string | null
}

/**
 * Current citation nodes for a bounded set of graph IDs. Tenant and current
 * role scope are enforced in SQL because the application database role bypasses
 * RLS. Results preserve caller order and omit missing, superseded, or forbidden
 * nodes.
 */
export async function getCortexCitationNodesByIds(
  tenantId: string,
  nodeIds: string[],
  nodeTypes?: string[] | null
): Promise<CortexCitationNode[]> {
  const orderedIds = [...new Set(nodeIds)].slice(0, 200)
  if (orderedIds.length === 0) return []

  const rows = await db
    .select({
      id: cortexNodes.id,
      node_type: cortexNodes.node_type,
      ref_table: cortexNodes.ref_table,
      ref_id: cortexNodes.ref_id,
      title: cortexNodes.title,
      projectId: sql<string | null>`${cortexNodes.attributes} ->> 'project_id'`,
    })
    .from(cortexNodes)
    .where(
      and(
        eq(cortexNodes.tenant_id, tenantId),
        inArray(cortexNodes.id, orderedIds),
        isNull(cortexNodes.valid_to),
        typeScopeFilter(nodeTypes)
      )
    )

  const byId = new Map(rows.map((node) => [node.id, node]))
  return orderedIds.flatMap((id) => {
    const node = byId.get(id)
    return node ? [node] : []
  })
}

/** Build an RBAC node-type filter, or undefined for "no restriction". */
function typeScopeFilter(nodeTypes?: string[] | null): SQL | undefined {
  if (!nodeTypes) return undefined
  if (nodeTypes.length === 0) return sql`false` // role sees nothing
  return inArray(cortexNodes.node_type, nodeTypes as CortexNode['node_type'][])
}

/** List current nodes for a tenant, optionally filtered by type and title text. */
export async function searchCortexNodes(
  tenantId: string,
  opts: { nodeType?: CortexNode['node_type']; nodeTypes?: string[] | null; query?: string; limit?: number } = {}
): Promise<CortexNode[]> {
  const filters: (SQL | undefined)[] = [eq(cortexNodes.tenant_id, tenantId), isNull(cortexNodes.valid_to)]
  if (opts.nodeType) filters.push(eq(cortexNodes.node_type, opts.nodeType))
  filters.push(typeScopeFilter(opts.nodeTypes))
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
  opts: { limit?: number; nodeTypes?: string[] | null } = {}
): Promise<CortexNeighbor[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT
  // RBAC: the joined neighbor node must be a type the caller may see, else a
  // user could read forbidden records via an in-scope record's connections.
  const scope = opts.nodeTypes
    ? opts.nodeTypes.length === 0
      ? sql`false`
      : inArray(cortexNodes.node_type, opts.nodeTypes as CortexNode['node_type'][])
    : undefined

  const outgoing = await db
    .select({ edge: cortexEdges, node: cortexNodes })
    .from(cortexEdges)
    .innerJoin(cortexNodes, eq(cortexEdges.dst_id, cortexNodes.id))
    .where(
      and(
        eq(cortexEdges.tenant_id, tenantId),
        eq(cortexEdges.src_id, nodeId),
        eq(cortexNodes.tenant_id, tenantId),
        isNull(cortexEdges.valid_to),
        isNull(cortexNodes.valid_to),
        scope
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
        eq(cortexNodes.tenant_id, tenantId),
        isNull(cortexEdges.valid_to),
        isNull(cortexNodes.valid_to),
        scope
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

/** Keyword search over titles + summaries — the no-embedding retrieval arm. */
export async function searchCortexNodesByTerms(
  tenantId: string,
  terms: string[],
  limit = 8,
  nodeTypes?: string[] | null
): Promise<CortexNode[]> {
  const cleaned = terms.filter((t) => t.length >= 3).slice(0, 8)
  if (cleaned.length === 0) return []
  const termConds = cleaned.map((t) =>
    or(
      ilike(cortexNodes.title, `%${t.replace(/[\\%_]/g, '\\$&')}%`),
      ilike(cortexNodes.summary, `%${t.replace(/[\\%_]/g, '\\$&')}%`)
    )
  )
  return db
    .select()
    .from(cortexNodes)
    .where(
      and(
        eq(cortexNodes.tenant_id, tenantId),
        isNull(cortexNodes.valid_to),
        typeScopeFilter(nodeTypes),
        or(...termConds)
      )
    )
    .orderBy(desc(cortexNodes.recorded_at))
    .limit(limit)
}

export interface SemanticHit {
  node: CortexNode
  distance: number
}

export interface CortexGraphNode {
  id: string
  type: string
  title: string | null
  refTable: string
  refId: string
  /** project this record belongs to (from attributes) — drives deep-linking. */
  projectId: string | null
}
export interface CortexGraphData {
  nodes: CortexGraphNode[]
  links: { source: string; target: string; type: string }[]
}

export interface CortexFocusedGraphData extends CortexGraphData {
  focusNodeId: string
}

function graphProjectId(attributes: unknown): string | null {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    return null
  }
  const projectId = (attributes as Record<string, unknown>).project_id
  return typeof projectId === 'string' ? projectId : null
}

function toGraphNode(node: CortexNode): CortexGraphNode {
  return {
    id: node.id,
    type: node.node_type,
    title: node.title,
    refTable: node.ref_table,
    refId: node.ref_id,
    projectId: graphProjectId(node.attributes),
  }
}

/**
 * One current node plus its permission-scoped, one-hop neighborhood.
 *
 * The focus ID must have been resolved by a trusted server caller. This helper
 * still re-checks tenant, current-row status, and role scope before returning
 * data because the application database role bypasses RLS.
 */
export async function getCortexFocusedGraph(
  tenantId: string,
  focusNodeId: string,
  neighborLimit = 40,
  nodeTypes?: string[] | null
): Promise<CortexFocusedGraphData | null> {
  const focusRows = await db
    .select()
    .from(cortexNodes)
    .where(
      and(
        eq(cortexNodes.tenant_id, tenantId),
        eq(cortexNodes.id, focusNodeId),
        isNull(cortexNodes.valid_to),
        typeScopeFilter(nodeTypes)
      )
    )
    .limit(1)
  const focus = focusRows[0]
  if (!focus) return null

  const boundedLimit = Math.max(1, Math.min(neighborLimit, 40))
  const neighbors = await getCortexNeighbors(tenantId, focus.id, {
    limit: boundedLimit,
    nodeTypes,
  })

  const nodeMap = new Map<string, CortexGraphNode>([
    [focus.id, toGraphNode(focus)],
  ])
  const edgeIds = new Set<string>()
  const links: CortexGraphData['links'] = []

  for (const neighbor of neighbors) {
    nodeMap.set(neighbor.node.id, toGraphNode(neighbor.node))
    if (edgeIds.has(neighbor.edgeId)) continue
    edgeIds.add(neighbor.edgeId)
    links.push(
      neighbor.direction === 'out'
        ? {
            source: focus.id,
            target: neighbor.node.id,
            type: neighbor.edgeType,
          }
        : {
            source: neighbor.node.id,
            target: focus.id,
            type: neighbor.edgeType,
          }
    )
  }

  return {
    focusNodeId: focus.id,
    nodes: [...nodeMap.values()],
    links,
  }
}

/**
 * Whole-graph fetch for the interactive visualization. Tenant-scoped and
 * capped for performance: at most `nodeLimit` current nodes, and only edges
 * whose endpoints are both in that node set (no dangling links).
 */
export async function getCortexGraph(
  tenantId: string,
  nodeLimit = 1500,
  nodeTypes?: string[] | null
): Promise<CortexGraphData> {
  const nodeRows = await db
    .select({
      id: cortexNodes.id,
      type: cortexNodes.node_type,
      title: cortexNodes.title,
      refTable: cortexNodes.ref_table,
      refId: cortexNodes.ref_id,
      projectId: sql<string | null>`${cortexNodes.attributes} ->> 'project_id'`,
    })
    .from(cortexNodes)
    .where(and(eq(cortexNodes.tenant_id, tenantId), isNull(cortexNodes.valid_to), typeScopeFilter(nodeTypes)))
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
export async function getCortexGraphStats(
  tenantId: string,
  nodeTypes?: string[] | null
): Promise<CortexGraphStats> {
  const scope = typeScopeFilter(nodeTypes)
  const scopedTypeList =
    nodeTypes && nodeTypes.length > 0
      ? sql.join(nodeTypes.map((nodeType) => sql`${nodeType}`), sql`, `)
      : null
  const scopedEdgeCount =
    nodeTypes === undefined || nodeTypes === null
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(cortexEdges)
          .where(
            and(
              eq(cortexEdges.tenant_id, tenantId),
              isNull(cortexEdges.valid_to)
            )
          )
      : nodeTypes.length === 0
        ? Promise.resolve([{ n: 0 }])
        : db.execute<{ n: number }>(sql`
            select count(*)::int as n
            from cortex_edges edge
            join cortex_nodes src
              on src.id = edge.src_id
             and src.tenant_id = edge.tenant_id
            join cortex_nodes dst
              on dst.id = edge.dst_id
             and dst.tenant_id = edge.tenant_id
            where edge.tenant_id = ${tenantId}
              and edge.valid_to is null
              and src.node_type::text in (${scopedTypeList})
              and dst.node_type::text in (${scopedTypeList})
          `)
  const scopedProvenanceCount =
    nodeTypes === undefined || nodeTypes === null
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(cortexProvenance)
          .where(eq(cortexProvenance.tenant_id, tenantId))
      : nodeTypes.length === 0
        ? Promise.resolve([{ n: 0 }])
        : db.execute<{ n: number }>(sql`
            select count(*)::int as n
            from cortex_provenance provenance
            where provenance.tenant_id = ${tenantId}
              and (
                (
                  provenance.subject_kind = 'node'
                  and exists (
                    select 1
                    from cortex_nodes node
                    where node.id = provenance.subject_id
                      and node.tenant_id = provenance.tenant_id
                      and node.node_type::text in (${scopedTypeList})
                  )
                )
                or
                (
                  provenance.subject_kind = 'edge'
                  and exists (
                    select 1
                    from cortex_edges edge
                    join cortex_nodes src
                      on src.id = edge.src_id
                     and src.tenant_id = edge.tenant_id
                    join cortex_nodes dst
                      on dst.id = edge.dst_id
                     and dst.tenant_id = edge.tenant_id
                    where edge.id = provenance.subject_id
                      and edge.tenant_id = provenance.tenant_id
                      and src.node_type::text in (${scopedTypeList})
                      and dst.node_type::text in (${scopedTypeList})
                  )
                )
              )
          `)
  const [nodeRows, edgeRows, provRows, typeRows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(cortexNodes)
      .where(and(eq(cortexNodes.tenant_id, tenantId), isNull(cortexNodes.valid_to), scope)),
    scopedEdgeCount,
    scopedProvenanceCount,
    db
      .select({ nodeType: cortexNodes.node_type, count: sql<number>`count(*)::int` })
      .from(cortexNodes)
      .where(and(eq(cortexNodes.tenant_id, tenantId), isNull(cortexNodes.valid_to), scope))
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
  opts: { nodeType?: CortexNode['node_type']; nodeTypes?: string[] | null; limit?: number } = {}
): Promise<SemanticHit[]> {
  const vec = toVectorLiteral(embedding)
  const distance = sql<number>`${cortexNodes.embedding} <=> ${vec}::vector`

  const filters: (SQL | undefined)[] = [
    eq(cortexNodes.tenant_id, tenantId),
    isNull(cortexNodes.valid_to),
    isNotNull(cortexNodes.embedding),
    typeScopeFilter(opts.nodeTypes),
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
