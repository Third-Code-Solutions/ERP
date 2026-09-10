import { z } from 'zod'

export const projectHandoverReadinessStatusSchema = z.enum([
  'ready',
  'partial',
  'unavailable',
])

export const projectHandoverReadinessQuerySchema = z.object({}).strict()

export const projectHandoverReadinessResultSchema = z
  .object({
    projectId: z.string().uuid(),
    asOf: z.string().datetime({ offset: true }),
    status: projectHandoverReadinessStatusSchema,
    turnoverPackageExists: z.boolean(),
    turnoverCompiled: z.boolean(),
    attachedSlotCount: z.number().int().nonnegative(),
    requiredSlotCount: z.number().int().positive(),
    cocStatus: z.enum(['draft', 'pending_signature', 'signed']).nullable(),
    totalPunchlistCount: z.number().int().nonnegative(),
    openPunchlistCount: z.number().int().nonnegative(),
    occupancyPermitStatus: z
      .enum([
        'not_started',
        'submitted',
        'additional_docs_required',
        'under_review',
        'approved',
        'rejected',
        'released',
        'refunded',
        'cancelled',
      ])
      .nullable(),
    blockers: z.array(z.string().trim().min(1).max(500)),
    notes: z.array(z.string().trim().min(1).max(500)),
  })
  .strict()

export type ProjectHandoverReadinessStatus = z.infer<
  typeof projectHandoverReadinessStatusSchema
>
export type ProjectHandoverReadinessQuery = z.infer<
  typeof projectHandoverReadinessQuerySchema
>
export type ProjectHandoverReadinessResult = z.infer<
  typeof projectHandoverReadinessResultSchema
>

export interface ProjectHandoverReadinessAggregate {
  turnoverPackageExists: boolean
  turnoverCompiled: boolean
  attachedSlotCount: number
  requiredSlotCount: number
  cocStatus: ProjectHandoverReadinessResult['cocStatus']
  totalPunchlistCount: number
  openPunchlistCount: number
  occupancyPermitStatus: ProjectHandoverReadinessResult['occupancyPermitStatus']
}

function nonnegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

/**
 * Explains handover readiness from existing turnover, COC, punchlist, and
 * occupancy evidence. It does not claim a zone/package handover because that
 * granularity is not represented in the current schema.
 */
export function buildProjectHandoverReadinessResult(
  projectId: string,
  asOf: string,
  aggregate: ProjectHandoverReadinessAggregate,
): ProjectHandoverReadinessResult {
  const requiredSlotCount = Math.max(1, nonnegativeInteger(aggregate.requiredSlotCount))
  const attachedSlotCount = Math.min(
    requiredSlotCount,
    nonnegativeInteger(aggregate.attachedSlotCount),
  )
  const totalPunchlistCount = nonnegativeInteger(aggregate.totalPunchlistCount)
  const openPunchlistCount = Math.min(
    totalPunchlistCount,
    nonnegativeInteger(aggregate.openPunchlistCount),
  )
  const blockers: string[] = []
  if (!aggregate.turnoverPackageExists) blockers.push('Turnover package has not been created.')
  if (attachedSlotCount < requiredSlotCount) blockers.push(`Turnover package is missing ${requiredSlotCount - attachedSlotCount} required document slot(s).`)
  if (!aggregate.turnoverCompiled) blockers.push('Turnover package is not compiled.')
  if (aggregate.cocStatus !== 'signed') blockers.push('Certificate of Completion is not signed.')
  if (openPunchlistCount > 0) blockers.push(`${openPunchlistCount} punchlist item(s) remain open.`)
  if (aggregate.occupancyPermitStatus !== 'approved' && aggregate.occupancyPermitStatus !== 'released') {
    blockers.push(
      aggregate.occupancyPermitStatus === null
        ? 'No occupancy permit evidence is recorded.'
        : `Occupancy permit is ${aggregate.occupancyPermitStatus.replaceAll('_', ' ')}.`,
    )
  }

  const hasAnyEvidence =
    aggregate.turnoverPackageExists ||
    aggregate.cocStatus !== null ||
    totalPunchlistCount > 0 ||
    aggregate.occupancyPermitStatus !== null
  const ready = blockers.length === 0
  return projectHandoverReadinessResultSchema.parse({
    projectId,
    asOf,
    status: ready ? 'ready' : hasAnyEvidence ? 'partial' : 'unavailable',
    turnoverPackageExists: aggregate.turnoverPackageExists,
    turnoverCompiled: aggregate.turnoverCompiled,
    attachedSlotCount,
    requiredSlotCount,
    cocStatus: aggregate.cocStatus,
    totalPunchlistCount,
    openPunchlistCount,
    occupancyPermitStatus: aggregate.occupancyPermitStatus,
    blockers,
    notes: [
      'Handover readiness is a source-evidence gate; it does not create a zone/package handover record.',
      'Bond refund, retention release, and P&L close-out remain separate controlled workflows.',
    ],
  })
}
