/**
 * Cortex retrieval + citation assembly (tenant-scoped, source-grounded).
 *
 * Turns the graph into a "context pack" for any ERP entity: the node, its live
 * neighbors, and its provenance — plus a citation list (node IDs → ERP rows).
 * This is what a Phase-4 agent (Atlas/Herald/Pulse/...) retrieves BEFORE it
 * answers, so every answer can cite real, in-scope records. The deterministic
 * `describeContextPack` is a no-LLM summary; Phase 4 swaps it for a model fed
 * this exact, already-permission-scoped context.
 *
 * Every read goes through the tenant-scoped graph API, so a context pack can
 * never include a node the caller couldn't open directly (NON-NEGOTIABLE #2/#6).
 */
import {
  getCortexNodeByRef,
  getCortexNeighbors,
  getCortexProvenance,
  searchCortexNodesByTerms,
  searchCortexNodes,
  type CortexNeighbor,
} from './graph'
import type { CortexNode, CortexProvenance } from '../schema/cortex'

export interface Citation {
  nodeId: string
  nodeType: string
  refTable: string
  refId: string
  title: string | null
}

export interface ContextPack {
  node: CortexNode
  neighbors: CortexNeighbor[]
  provenance: CortexProvenance[]
  citations: Citation[]
}

export interface CortexAnswer {
  found: boolean
  /** Deterministic, citation-backed summary. Empty when `found` is false. */
  summary: string
  citations: Citation[]
}

/**
 * Deterministic, grounded answer to a free-text question — no LLM required.
 * Keyword-matches the tenant's graph and returns a cited record list. This is
 * the agent's always-available fallback: it works with zero external services,
 * is always source-grounded, and never hallucinates.
 */
export async function cortexKeywordAnswer(
  tenantId: string,
  question: string
): Promise<{ answer: string; citations: Citation[] }> {
  const terms = question.toLowerCase().split(/[^a-z0-9₱]+/i).filter(Boolean)
  const hits = await searchCortexNodesByTerms(tenantId, terms, 8)

  // Never come up empty: for broad/meta questions (e.g. "what changed recently",
  // "overview") keyword match misses, so fall back to the most recent records.
  const matched = hits.length > 0
  const used = matched ? hits : await searchCortexNodes(tenantId, { limit: 8 })

  if (used.length === 0) {
    return {
      answer: 'Your knowledge graph is empty for now — create a project, account or BOM and it will appear here.',
      citations: [],
    }
  }

  const lines = used.map(
    (h) => `• [${h.node_type}] ${h.title ?? '(untitled)'}${h.summary ? ` — ${h.summary}` : ''}`
  )
  const intro = matched
    ? "Here's what I found in your knowledge graph:"
    : 'Here are the most recently updated records in your knowledge graph:'
  const answer = `${intro}\n\n${lines.join('\n')}\n\nCited ${used.length} record${used.length === 1 ? '' : 's'} — open any from the graph to dig in.`
  return { answer, citations: used.map(toCitation) }
}

/**
 * Deterministic text used to embed a node for semantic search. Keep stable —
 * changing it means re-embedding the whole graph. Includes the type so a query
 * like "unpaid invoice" lands near invoice nodes.
 */
export function cortexEmbeddingText(
  node: Pick<CortexNode, 'node_type' | 'title' | 'summary'>
): string {
  return [node.node_type, node.title ?? '', node.summary ?? '']
    .filter(Boolean)
    .join(' — ')
    .slice(0, 8000)
}

function toCitation(node: Pick<CortexNode, 'id' | 'node_type' | 'ref_table' | 'ref_id' | 'title'>): Citation {
  return {
    nodeId: node.id,
    nodeType: node.node_type,
    refTable: node.ref_table,
    refId: node.ref_id,
    title: node.title,
  }
}

/**
 * Assemble the context pack for one ERP entity. Returns null when the entity
 * has no in-scope graph node (the honest "nothing here" path).
 */
export async function getCortexContextPack(
  tenantId: string,
  refTable: string,
  refId: string,
  opts: { neighborLimit?: number; provenanceLimit?: number } = {}
): Promise<ContextPack | null> {
  const node = await getCortexNodeByRef(tenantId, refTable, refId)
  if (!node) return null

  const [neighbors, provenance] = await Promise.all([
    getCortexNeighbors(tenantId, node.id, { limit: opts.neighborLimit ?? 50 }),
    getCortexProvenance(tenantId, 'node', node.id, opts.provenanceLimit ?? 10),
  ])

  const citations: Citation[] = [
    toCitation(node),
    ...neighbors.map((n) => toCitation(n.node)),
  ]

  return { node, neighbors, provenance, citations }
}

/** Group neighbors as "edge_type direction" → list of neighbor titles. */
function groupNeighbors(neighbors: CortexNeighbor[]): Map<string, CortexNeighbor[]> {
  const groups = new Map<string, CortexNeighbor[]>()
  for (const n of neighbors) {
    const key = n.direction === 'out' ? n.edgeType : `${n.edgeType} (incoming)`
    const list = groups.get(key) ?? []
    list.push(n)
    groups.set(key, list)
  }
  return groups
}

/**
 * Deterministic, human-readable summary of a context pack. No LLM — every line
 * is grounded in a graph node. Phase 4 replaces this with a model that receives
 * the same pack and must cite the same node IDs.
 */
export function describeContextPack(pack: ContextPack): string {
  const lines: string[] = []
  const n = pack.node
  lines.push(`${n.node_type}: ${n.title ?? '(untitled)'}${n.summary ? ` — ${n.summary}` : ''}`)

  const groups = groupNeighbors(pack.neighbors)
  if (groups.size === 0) {
    lines.push('No related records in the graph yet.')
  } else {
    for (const [rel, items] of groups) {
      const names = items
        .map((i) => i.node.title ?? `${i.node.node_type}:${i.node.ref_id.slice(0, 8)}`)
        .join(', ')
      lines.push(`${rel}: ${names}`)
    }
  }
  return lines.join('\n')
}

/**
 * Answer "tell me about this entity" from the graph, with citations and an
 * explicit "I don't know" path when the entity is not in scope / not mirrored.
 */
export async function cortexDescribeEntity(
  tenantId: string,
  refTable: string,
  refId: string
): Promise<CortexAnswer> {
  const pack = await getCortexContextPack(tenantId, refTable, refId)
  if (!pack) {
    return {
      found: false,
      summary: '',
      citations: [],
    }
  }
  return {
    found: true,
    summary: describeContextPack(pack),
    citations: pack.citations,
  }
}
