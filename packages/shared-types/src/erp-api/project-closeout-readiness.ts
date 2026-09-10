import { z } from 'zod'

export const projectCloseoutReadinessStatusSchema = z.enum(['ready', 'partial', 'unavailable'])
export const projectCloseoutBondTypeSchema = z.enum(['performance_bond', 'surety_bond', 'construction_bond'])
export const projectCloseoutBondStatusSchema = z.enum([
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

const nullableDateTime = z.string().datetime({ offset: true }).nullable()

export const projectCloseoutBondRowSchema = z.object({
  permitId: z.string().uuid(),
  permitType: projectCloseoutBondTypeSchema,
  status: projectCloseoutBondStatusSchema,
  expectedReturnAt: nullableDateTime,
  actualReturnAt: nullableDateTime,
  refundedAt: nullableDateTime,
}).strict()

export const projectCloseoutReadinessQuerySchema = z.object({}).strict()

export const projectCloseoutReadinessResultSchema = z.object({
  projectId: z.string().uuid(),
  asOf: z.string().datetime({ offset: true }),
  status: projectCloseoutReadinessStatusSchema,
  bonds: z.object({
    total: z.number().int().nonnegative(),
    refunded: z.number().int().nonnegative(),
    open: z.number().int().nonnegative(),
    rows: z.array(projectCloseoutBondRowSchema),
  }).strict(),
  retention: z.object({
    invoiceCount: z.number().int().nonnegative(),
    retainedCentavos: z.number().int().nonnegative(),
    allocatedCentavos: z.number().int().nonnegative(),
    openCentavos: z.number().int().nonnegative(),
  }).strict(),
  pnlCloseoutStatus: z.enum(['available', 'unavailable']),
  blockers: z.array(z.string().trim().min(1).max(500)),
  notes: z.array(z.string().trim().min(1).max(500)),
}).strict()

export type ProjectCloseoutReadinessStatus = z.infer<typeof projectCloseoutReadinessStatusSchema>
export type ProjectCloseoutBondRow = z.infer<typeof projectCloseoutBondRowSchema>
export type ProjectCloseoutReadinessQuery = z.infer<typeof projectCloseoutReadinessQuerySchema>
export type ProjectCloseoutReadinessResult = z.infer<typeof projectCloseoutReadinessResultSchema>

export interface ProjectCloseoutReadinessAggregate {
  bonds: ProjectCloseoutBondRow[]
  invoiceCount: number
  retainedCentavos: number
  allocatedCentavos: number
  pnlCloseoutStatus: 'available' | 'unavailable'
}

function nonnegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

/**
 * Projects existing bond and retention evidence without inventing contract
 * terms or claiming a statutory P&L close-out that the current schema does not
 * represent.
 */
export function buildProjectCloseoutReadinessResult(
  projectId: string,
  asOf: string,
  aggregate: ProjectCloseoutReadinessAggregate,
): ProjectCloseoutReadinessResult {
  const bonds = aggregate.bonds.map((row) => projectCloseoutBondRowSchema.parse(row))
  const refunded = bonds.filter((row) => row.status === 'refunded' || row.refundedAt !== null).length
  const open = Math.max(0, bonds.length - refunded)
  const invoiceCount = nonnegativeInteger(aggregate.invoiceCount)
  const retainedCentavos = nonnegativeInteger(aggregate.retainedCentavos)
  const allocatedCentavos = Math.min(retainedCentavos, nonnegativeInteger(aggregate.allocatedCentavos))
  const openCentavos = retainedCentavos - allocatedCentavos
  const blockers: string[] = []
  if (open > 0) blockers.push(`${open} bond record(s) remain without refund evidence.`)
  if (openCentavos > 0) blockers.push(`Retention evidence shows ${openCentavos} centavos not yet allocated.`)
  if (aggregate.pnlCloseoutStatus !== 'available') blockers.push('Project P&L close-out evidence is not represented in the current source records.')
  const hasEvidence = bonds.length > 0 || invoiceCount > 0
  const ready = hasEvidence && blockers.length === 0
  return projectCloseoutReadinessResultSchema.parse({
    projectId,
    asOf,
    status: ready ? 'ready' : hasEvidence ? 'partial' : 'unavailable',
    bonds: { total: bonds.length, refunded, open, rows: bonds },
    retention: { invoiceCount, retainedCentavos, allocatedCentavos, openCentavos },
    pnlCloseoutStatus: aggregate.pnlCloseoutStatus,
    blockers,
    notes: [
      'Close-out readiness reports existing bond and retention evidence only; it does not infer contract release terms.',
      'P&L close-out remains separate from SAP statutory accounting and is unavailable until an approved source workflow exists.',
    ],
  })
}
