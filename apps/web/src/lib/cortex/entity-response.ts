import type { Citation, ContextPack } from '@third-code-erp/database'
import {
  cortexEntityEvidenceEvent,
  cortexEntityResponseFromSources,
  cortexRelationshipLabel,
  type CortexEntityResponse,
  type CortexEvidenceEvent,
  type CortexRelationship,
} from '@third-code-erp/shared-types'

export {
  cortexRelationshipLabel,
  type CortexEntityResponse,
  type CortexEvidenceEvent,
  type CortexRelationship,
}

export function cortexEvidenceEvent(
  provenance: ContextPack['provenance'][number]
): CortexEvidenceEvent | null {
  return cortexEntityEvidenceEvent({
    origin: provenance.origin,
    createdAt: provenance.created_at,
  })
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

  return cortexEntityResponseFromSources({
    summary: summary(pack),
    citations: pack.citations as Citation[],
    relationships: pack.neighbors
      .slice(0, Math.max(0, relationshipLimit))
      .map((neighbor) => ({
        edgeId: neighbor.edgeId,
        edgeType: neighbor.edgeType,
        direction: neighbor.direction,
        origin: neighbor.origin,
        confidence: neighbor.confidence,
        nodeId: neighbor.node.id,
      })),
    evidence: pack.provenance
      .slice(0, Math.max(0, evidenceLimit))
      .map((provenance) => ({
        origin: provenance.origin,
        createdAt: provenance.created_at,
      })),
  })
}
