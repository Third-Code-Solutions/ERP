import { z } from 'zod'

export const projectMaterialActualsStatusSchema = z.enum([
  'ready',
  'partial',
  'unavailable',
])

export const projectMaterialActualsQuerySchema = z.object({}).strict()

export const projectMaterialActualsRowSchema = z
  .object({
    materialItemId: z.string().uuid(),
    code: z.string().trim().min(1).max(64),
    description: z.string().trim().min(1).max(500),
    unit: z.string().trim().min(1).max(32),
    receivedQuantityMicros: z.number().int().nonnegative(),
    issuedQuantityMicros: z.number().int().nonnegative(),
    receivedValueCents: z.number().int().nonnegative(),
    issuedValueCents: z.number().int().nonnegative(),
    receiptLineCount: z.number().int().nonnegative(),
    issueLineCount: z.number().int().nonnegative(),
    remainingQuantityMicros: z.number().int().nonnegative(),
    remainingValueCents: z.number().int().nonnegative(),
    notes: z.array(z.string().trim().min(1).max(500)),
  })
  .strict()

export const projectMaterialActualsTotalsSchema = z
  .object({
    receiptCount: z.number().int().nonnegative(),
    issueCount: z.number().int().nonnegative(),
    receiptLineCount: z.number().int().nonnegative(),
    issueLineCount: z.number().int().nonnegative(),
    receivedQuantityMicros: z.number().int().nonnegative(),
    issuedQuantityMicros: z.number().int().nonnegative(),
    receivedValueCents: z.number().int().nonnegative(),
    issuedValueCents: z.number().int().nonnegative(),
    remainingQuantityMicros: z.number().int().nonnegative(),
    remainingValueCents: z.number().int().nonnegative(),
  })
  .strict()

export const projectMaterialActualsResultSchema = z
  .object({
    projectId: z.string().uuid(),
    asOf: z.string().datetime({ offset: true }),
    currency: z.string().regex(/^[A-Z]{3}$/),
    status: projectMaterialActualsStatusSchema,
    rows: z.array(projectMaterialActualsRowSchema),
    totals: projectMaterialActualsTotalsSchema,
    notes: z.array(z.string().trim().min(1).max(500)),
  })
  .strict()

export type ProjectMaterialActualsStatus = z.infer<
  typeof projectMaterialActualsStatusSchema
>
export type ProjectMaterialActualsQuery = z.infer<
  typeof projectMaterialActualsQuerySchema
>
export type ProjectMaterialActualsRow = z.infer<
  typeof projectMaterialActualsRowSchema
>
export type ProjectMaterialActualsTotals = z.infer<
  typeof projectMaterialActualsTotalsSchema
>
export type ProjectMaterialActualsResult = z.infer<
  typeof projectMaterialActualsResultSchema
>

export interface ProjectMaterialActualAggregate {
  materialItemId: string
  code: string
  description: string
  unit: string
  receivedQuantityMicros: number
  issuedQuantityMicros: number
  receivedValueCents: number
  issuedValueCents: number
  receiptLineCount: number
  issueLineCount: number
}

export interface ProjectMaterialActualSourceCounts {
  receiptCount: number
  issueCount: number
}

function nonnegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

/**
 * Builds an operational inventory actuals projection from posted goods
 * receipts and posted project consumption movements. This is deliberately
 * separate from posted supplier-bill actual cost so the UI cannot double count
 * inventory value while an SAP/accounting integration is not configured.
 */
export function buildProjectMaterialActualsResult(
  projectId: string,
  asOf: string,
  aggregates: readonly ProjectMaterialActualAggregate[],
  sourceCounts: ProjectMaterialActualSourceCounts,
  currency = 'PHP',
): ProjectMaterialActualsResult {
  const notes: string[] = []
  const rows = aggregates
    .map((aggregate) => {
      const receivedQuantityMicros = nonnegativeInteger(
        aggregate.receivedQuantityMicros,
      )
      const issuedQuantityMicros = nonnegativeInteger(
        aggregate.issuedQuantityMicros,
      )
      const receivedValueCents = nonnegativeInteger(aggregate.receivedValueCents)
      const issuedValueCents = nonnegativeInteger(aggregate.issuedValueCents)
      const rowNotes: string[] = []
      if (issuedQuantityMicros > receivedQuantityMicros) {
        rowNotes.push(
          'Posted project issues exceed project-linked receipts; investigate opening stock or transfer evidence.',
        )
      }
      return projectMaterialActualsRowSchema.parse({
        materialItemId: aggregate.materialItemId,
        code: aggregate.code,
        description: aggregate.description,
        unit: aggregate.unit,
        receivedQuantityMicros,
        issuedQuantityMicros,
        receivedValueCents,
        issuedValueCents,
        receiptLineCount: nonnegativeInteger(aggregate.receiptLineCount),
        issueLineCount: nonnegativeInteger(aggregate.issueLineCount),
        remainingQuantityMicros: Math.max(
          0,
          receivedQuantityMicros - issuedQuantityMicros,
        ),
        remainingValueCents: Math.max(0, receivedValueCents - issuedValueCents),
        notes: rowNotes,
      })
    })
    .sort(
      (left, right) =>
        right.issuedValueCents - left.issuedValueCents ||
        left.code.localeCompare(right.code),
    )

  const totals = rows.reduce<ProjectMaterialActualsTotals>(
    (accumulator, row) => ({
      receiptCount: accumulator.receiptCount,
      issueCount: accumulator.issueCount,
      receiptLineCount: accumulator.receiptLineCount + row.receiptLineCount,
      issueLineCount: accumulator.issueLineCount + row.issueLineCount,
      receivedQuantityMicros:
        accumulator.receivedQuantityMicros + row.receivedQuantityMicros,
      issuedQuantityMicros:
        accumulator.issuedQuantityMicros + row.issuedQuantityMicros,
      receivedValueCents:
        accumulator.receivedValueCents + row.receivedValueCents,
      issuedValueCents:
        accumulator.issuedValueCents + row.issuedValueCents,
      remainingQuantityMicros:
        accumulator.remainingQuantityMicros + row.remainingQuantityMicros,
      remainingValueCents:
        accumulator.remainingValueCents + row.remainingValueCents,
    }),
    {
      receiptCount: nonnegativeInteger(sourceCounts.receiptCount),
      issueCount: nonnegativeInteger(sourceCounts.issueCount),
      receiptLineCount: 0,
      issueLineCount: 0,
      receivedQuantityMicros: 0,
      issuedQuantityMicros: 0,
      receivedValueCents: 0,
      issuedValueCents: 0,
      remainingQuantityMicros: 0,
      remainingValueCents: 0,
    },
  )

  if (rows.length === 0) {
    notes.push(
      'No posted project-linked goods receipts or project consumption movements were found.',
    )
  }
  if (rows.some((row) => row.notes.length > 0)) {
    notes.push(
      'Some materials have more posted issue quantity than project-linked receipt quantity; this projection does not invent opening-stock or transfer allocations.',
    )
  }
  notes.push(
    'Inventory issue value is shown as operational evidence and is not added to posted supplier-bill actual cost.',
  )
  notes.push(
    'SAP posting is not configured; no external accounting success is claimed.',
  )

  const status: ProjectMaterialActualsStatus =
    rows.length === 0
      ? 'unavailable'
      : rows.some((row) => row.notes.length > 0)
        ? 'partial'
        : 'ready'

  return projectMaterialActualsResultSchema.parse({
    projectId,
    asOf,
    currency,
    status,
    rows,
    totals,
    notes,
  })
}
