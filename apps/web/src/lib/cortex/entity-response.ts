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

export type CortexEvidenceKind =
  | 'record_change'
  | 'document'
  | 'ai_analysis'
  | 'data_import'
  | 'system'

export interface CortexEvidenceEvent {
  kind: CortexEvidenceKind
  label: string
  detail: string
  recordedAt: string
}

export interface CortexEntityResponse {
  found: boolean
  summary: string
  citations: Citation[]
  relationships: CortexRelationship[]
  evidence: CortexEvidenceEvent[]
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

const EVIDENCE_PRESENTATION: Record<
  string,
  Omit<CortexEvidenceEvent, 'recordedAt'>
> = {
  mutation: {
    kind: 'record_change',
    label: 'ERP record change',
    detail: 'Captured from an authorized ERP record change.',
  },
  document: {
    kind: 'document',
    label: 'Document evidence',
    detail: 'Captured from an ingested document.',
  },
  ai_run: {
    kind: 'ai_analysis',
    label: 'AI analysis',
    detail: 'Recorded from AI analysis for human review.',
  },
  import: {
    kind: 'data_import',
    label: 'Data import',
    detail: 'Captured during an authorized data import.',
  },
}

const SYSTEM_EVIDENCE: Omit<CortexEvidenceEvent, 'recordedAt'> = {
  kind: 'system',
  label: 'System evidence',
  detail: 'Recorded by Cortex.',
}

export function cortexRelationshipLabel(
  edgeType: string,
  direction: 'out' | 'in'
): string {
  return RELATIONSHIP_LABELS[edgeType]?.[direction] ?? 'Connected'
}

function evidenceTimestamp(value: unknown): string | null {
  const timestamp =
    value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString()
}

export function cortexEvidenceEvent(
  provenance: ContextPack['provenance'][number]
): CortexEvidenceEvent | null {
  const recordedAt = evidenceTimestamp(provenance.created_at)
  if (!recordedAt) return null

  return {
    ...(EVIDENCE_PRESENTATION[provenance.origin] ?? SYSTEM_EVIDENCE),
    recordedAt,
  }
}

export function cortexEntityResponse(
  pack: ContextPack | null,
  summary: (pack: ContextPack) => string,
  relationshipLimit = 12,
  evidenceLimit = 6
): CortexEntityResponse {
  if (!pack) {
    return {
      found: false,
      summary: '',
      citations: [],
      relationships: [],
      evidence: [],
    }
  }

  const citationsByNodeId = new Map(
    pack.citations.map((citation) => [citation.nodeId, citation])
  )
  const relationships = pack.neighbors
    .slice(0, Math.max(0, relationshipLimit))
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
  const evidence = pack.provenance
    .flatMap<CortexEvidenceEvent>((provenance) => {
      const event = cortexEvidenceEvent(provenance)
      return event ? [event] : []
    })
    .slice(0, Math.max(0, evidenceLimit))

  return {
    found: true,
    summary: summary(pack),
    citations: pack.citations,
    relationships,
    evidence,
  }
}
