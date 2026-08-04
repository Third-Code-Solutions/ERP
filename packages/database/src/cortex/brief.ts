/**
 * Bounded Cortex operating brief.
 *
 * This is a read-only projection over the derived graph. Canonical ERP rows
 * remain the source of truth; this helper never mutates records, invokes an
 * LLM, or spends an external provider credit. The caller supplies the role
 * scope, and both graph reads repeat the tenant filter because the application
 * database role bypasses RLS.
 */
import {
  getCortexGraphStats,
  searchCortexNodes,
  type CortexGraphStats,
} from './graph'
import type { CortexNode } from '../schema/cortex'

export const CORTEX_BRIEF_DEFAULT_LIMIT = 12
export const CORTEX_BRIEF_MAX_LIMIT = 24

export interface CortexBriefItem {
  nodeId: string
  nodeType: CortexNode['node_type']
  refTable: string
  refId: string
  title: string | null
  summary: string | null
  freshness: CortexNode['freshness']
  recordedAt: Date
  projectId: string | null
}

export interface CortexFreshnessCounts {
  fresh: number
  stale: number
  unknown: number
}

export interface CortexOperationalBrief {
  generatedAt: Date
  stats: CortexGraphStats
  freshness: CortexFreshnessCounts
  items: CortexBriefItem[]
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function projectIdFromAttributes(attributes: unknown): string | null {
  if (
    typeof attributes !== 'object' ||
    attributes === null ||
    Array.isArray(attributes)
  ) {
    return null
  }
  const value = (attributes as Record<string, unknown>).project_id
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null
}

function boundedLimit(limit: number): number {
  if (!Number.isFinite(limit)) return CORTEX_BRIEF_DEFAULT_LIMIT
  return Math.max(1, Math.min(Math.trunc(limit), CORTEX_BRIEF_MAX_LIMIT))
}

/**
 * Build a permission-scoped, source-backed snapshot for an operator view.
 * Results are intentionally small so opening the dashboard cannot create a
 * large database or AI bill.
 */
export async function getCortexOperationalBrief(
  tenantId: string,
  nodeTypes?: string[] | null,
  limit = CORTEX_BRIEF_DEFAULT_LIMIT
): Promise<CortexOperationalBrief> {
  const [stats, nodes] = await Promise.all([
    getCortexGraphStats(tenantId, nodeTypes),
    searchCortexNodes(tenantId, {
      limit: boundedLimit(limit),
      nodeTypes,
    }),
  ])

  const freshness: CortexFreshnessCounts = {
    fresh: 0,
    stale: 0,
    unknown: 0,
  }

  const items = nodes.map<CortexBriefItem>((node) => {
    freshness[node.freshness] += 1
    return {
      nodeId: node.id,
      nodeType: node.node_type,
      refTable: node.ref_table,
      refId: node.ref_id,
      title: node.title,
      summary: node.summary,
      freshness: node.freshness,
      recordedAt: node.recorded_at,
      projectId: projectIdFromAttributes(node.attributes),
    }
  })

  return {
    generatedAt: new Date(),
    stats,
    freshness,
    items,
  }
}
