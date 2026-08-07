import { z } from 'zod'
import { cortexGraphRefTableSchema } from './cortex-graph'

export const cortexEntityParamsSchema = z
  .object({
    refTable: cortexGraphRefTableSchema,
    refId: z.string().uuid(),
  })
  .strict()

export type CortexEntityParams = z.infer<typeof cortexEntityParamsSchema>

export const cortexCitationSchema = z
  .object({
    nodeId: z.string().uuid(),
    nodeType: z.string().trim().min(1).max(64),
    refTable: cortexGraphRefTableSchema,
    refId: z.string().uuid(),
    title: z.string().max(500).nullable(),
    projectId: z.string().uuid().nullable(),
  })
  .strict()

export type CortexCitation = z.infer<typeof cortexCitationSchema>

export const cortexRelationshipSchema = z
  .object({
    edgeId: z.string().uuid(),
    edgeType: z.string().trim().min(1).max(128),
    direction: z.enum(['out', 'in']),
    label: z.string().trim().min(1).max(128),
    origin: z.string().trim().min(1).max(64),
    confidence: z.number().finite().min(0).max(1),
    citation: cortexCitationSchema,
  })
  .strict()

export type CortexRelationship = z.infer<typeof cortexRelationshipSchema>

export const cortexEvidenceKindValues = [
  'record_change',
  'document',
  'ai_analysis',
  'data_import',
  'system',
] as const

export const cortexEvidenceEventSchema = z
  .object({
    kind: z.enum(cortexEvidenceKindValues),
    label: z.string().trim().min(1).max(100),
    detail: z.string().trim().min(1).max(500),
    recordedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type CortexEvidenceEvent = z.infer<
  typeof cortexEvidenceEventSchema
>

const cortexEntityFields = {
  summary: z.string().max(100_000),
  citations: z.array(cortexCitationSchema).max(13),
  relationships: z.array(cortexRelationshipSchema).max(12),
  evidence: z.array(cortexEvidenceEventSchema).max(6),
}

export const cortexEntityFoundResponseSchema = z
  .object({
    found: z.literal(true),
    ...cortexEntityFields,
  })
  .strict()

export const cortexEntityEmptyResponseSchema = z
  .object({
    found: z.literal(false),
    ...cortexEntityFields,
  })
  .strict()

export const cortexEntityResponseSchema = z.discriminatedUnion('found', [
  cortexEntityFoundResponseSchema,
  cortexEntityEmptyResponseSchema,
])

export type CortexEntityFoundResponse = z.infer<
  typeof cortexEntityFoundResponseSchema
>
export type CortexEntityResponse = z.infer<
  typeof cortexEntityResponseSchema
>

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

export function cortexEntityEvidenceEvent(source: {
  origin: string
  createdAt: unknown
}): CortexEvidenceEvent | null {
  const timestamp =
    source.createdAt instanceof Date
      ? source.createdAt
      : new Date(String(source.createdAt))
  if (Number.isNaN(timestamp.getTime())) return null

  return cortexEvidenceEventSchema.parse({
    ...(EVIDENCE_PRESENTATION[source.origin] ?? SYSTEM_EVIDENCE),
    recordedAt: timestamp.toISOString(),
  })
}

export interface CortexEntityResponseSources {
  summary: string
  citations: Array<{
    nodeId: string
    nodeType: string
    refTable: string
    refId: string
    title: string | null
    projectId: string | null
  }>
  relationships: Array<{
    edgeId: string
    edgeType: string
    direction: 'out' | 'in'
    origin: string
    confidence: number
    nodeId: string
  }>
  evidence: Array<{ origin: string; createdAt: unknown }>
}

/** Build the public projection from already tenant- and role-scoped sources. */
export function cortexEntityResponseFromSources(
  sources: CortexEntityResponseSources
): CortexEntityFoundResponse {
  const citations = z
    .array(cortexCitationSchema)
    .max(13)
    .parse(sources.citations)
  const citationsByNodeId = new Map(
    citations.map((citation) => [citation.nodeId, citation])
  )
  const relationships = sources.relationships
    .slice(0, 12)
    .flatMap<CortexRelationship>((relationship) => {
      const citation = citationsByNodeId.get(relationship.nodeId)
      if (!citation) return []

      return [
        {
          edgeId: relationship.edgeId,
          edgeType: relationship.edgeType,
          direction: relationship.direction,
          label: cortexRelationshipLabel(
            relationship.edgeType,
            relationship.direction
          ),
          origin: relationship.origin,
          confidence: relationship.confidence,
          citation,
        },
      ]
    })
  const evidence = sources.evidence
    .flatMap<CortexEvidenceEvent>((source) => {
      const event = cortexEntityEvidenceEvent(source)
      return event ? [event] : []
    })
    .slice(0, 6)

  return cortexEntityFoundResponseSchema.parse({
    found: true,
    summary: sources.summary,
    citations,
    relationships,
    evidence,
  })
}
