import type { Citation, ContextPack } from '@third-code-erp/database'

export interface CortexRelationship {
  edgeId: string
  edgeType: string
  direction: 'out' | 'in'
  label: string
  origin: string
  confidence: number
  citation: Citation
}

export interface CortexEntityResponse {
  found: boolean
  summary: string
  citations: Citation[]
  relationships: CortexRelationship[]
}

const RELATIONSHIP_LABELS: Record<
  string,
  { out: string; in: string }
> = {
  owns: { out: 'Owns', in: 'Owned by' },
  assigned_to: { out: 'Assigned to', in: 'Assigned work' },
  member_of: { out: 'Member of', in: 'Has member' },
  part_of: { out: 'Part of', in: 'Contains' },
  derived_from: { out: 'Derived from', in: 'Source for' },
  bills: { out: 'Bills', in: 'Billed by' },
  supplies: { out: 'Supplies', in: 'Supplied by' },
  pays: { out: 'Pays', in: 'Paid by' },
  blocks: { out: 'Blocks', in: 'Blocked by' },
  depends_on: { out: 'Depends on', in: 'Required by' },
  mentions: { out: 'Mentions', in: 'Mentioned by' },
  scheduled_for: { out: 'Scheduled for', in: 'Scheduled item' },
  approved_by: { out: 'Approved by', in: 'Approves' },
  superseded_by: { out: 'Superseded by', in: 'Supersedes' },
  references_doc: { out: 'References', in: 'Referenced by' },
}

export function cortexRelationshipLabel(
  edgeType: string,
  direction: 'out' | 'in'
): string {
  return RELATIONSHIP_LABELS[edgeType]?.[direction] ?? 'Connected'
}

export function cortexEntityResponse(
  pack: ContextPack | null,
  summary: (pack: ContextPack) => string,
  limit = 12
): CortexEntityResponse {
  if (!pack) {
    return {
      found: false,
      summary: '',
      citations: [],
      relationships: [],
    }
  }

  const citationsByNodeId = new Map(
    pack.citations.map((citation) => [citation.nodeId, citation])
  )
  const relationships = pack.neighbors
    .slice(0, Math.max(0, limit))
    .flatMap<CortexRelationship>((neighbor) => {
      const citation = citationsByNodeId.get(neighbor.node.id)
      if (!citation) return []

      return [
        {
          edgeId: neighbor.edgeId,
          edgeType: neighbor.edgeType,
          direction: neighbor.direction,
          label: cortexRelationshipLabel(
            neighbor.edgeType,
            neighbor.direction
          ),
          origin: neighbor.origin,
          confidence: neighbor.confidence,
          citation,
        },
      ]
    })

  return {
    found: true,
    summary: summary(pack),
    citations: pack.citations,
    relationships,
  }
}
