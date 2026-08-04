import type {
  CortexBriefItem,
  CortexOperationalBrief,
} from '@third-code-erp/database'
import {
  cortexEntityDefinition,
  cortexHref,
} from './entity-registry'

export interface CortexBriefViewItem {
  id: string
  nodeType: string
  label: string
  title: string
  summary: string | null
  href: string
  refTable: string
  refId: string
  freshness: CortexBriefItem['freshness']
  recordedAt: string
}

export interface CortexBriefView {
  generatedAt: string
  freshness: CortexOperationalBrief['freshness']
  stats: CortexOperationalBrief['stats']
  items: CortexBriefViewItem[]
}

/**
 * Converts the server brief into a render-safe model. The registry is the
 * allow-list: unknown graph sources never reach a clickable UI surface.
 */
export function presentCortexBrief(
  brief: CortexOperationalBrief,
  maxItems = 6
): CortexBriefView {
  const boundedMaxItems = Number.isFinite(maxItems)
    ? Math.max(0, Math.min(Math.trunc(maxItems), 24))
    : 6

  const items = brief.items.flatMap<CortexBriefViewItem>((item) => {
    const definition = cortexEntityDefinition(item.nodeType)
    if (!definition || !definition.refTables.includes(item.refTable)) return []

    const href = cortexHref({
      type: item.nodeType,
      refId: item.refId,
      projectId: item.projectId,
    })
    if (!href) return []

    return [
      {
        id: item.nodeId,
        nodeType: item.nodeType,
        label: definition.label,
        title: item.title?.trim() || definition.label,
        summary: item.summary?.trim() || null,
        href,
        refTable: item.refTable,
        refId: item.refId,
        freshness: item.freshness,
        recordedAt: item.recordedAt.toISOString(),
      },
    ]
  })

  return {
    generatedAt: brief.generatedAt.toISOString(),
    freshness: brief.freshness,
    stats: brief.stats,
    items: items.slice(0, boundedMaxItems),
  }
}
