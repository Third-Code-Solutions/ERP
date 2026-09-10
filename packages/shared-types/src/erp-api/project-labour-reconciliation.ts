import { z } from 'zod'

export const projectLabourReconciliationEvidenceSchema = z.enum([
  'reported',
  'not_due',
  'missing',
])

export const projectLabourReconciliationStatusSchema = z.enum([
  'ready',
  'partial',
  'unavailable',
])

export const projectLabourReconciliationQuerySchema = z.object({}).strict()

export const projectLabourReconciliationRowSchema = z
  .object({
    taskId: z.string().uuid(),
    level: z.enum(['l1', 'l2', 'l3', 'l4']),
    taskCode: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(200),
    taskStatus: z.enum(['planned', 'in_progress', 'blocked', 'completed', 'cancelled']),
    plannedLaborMinutes: z.number().int().nonnegative(),
    actualLaborMinutes: z.number().int().nonnegative(),
    varianceMinutes: z.number().int(),
    utilizationBps: z.number().int().nonnegative().nullable(),
    evidence: projectLabourReconciliationEvidenceSchema,
    notes: z.array(z.string().trim().min(1).max(500)),
  })
  .strict()

export const projectLabourReconciliationTotalsSchema = z
  .object({
    taskCount: z.number().int().nonnegative(),
    plannedLaborMinutes: z.number().int().nonnegative(),
    actualLaborMinutes: z.number().int().nonnegative(),
    varianceMinutes: z.number().int(),
    reportedTaskCount: z.number().int().nonnegative(),
    missingEvidenceTaskCount: z.number().int().nonnegative(),
  })
  .strict()

export const projectLabourReconciliationResultSchema = z
  .object({
    projectId: z.string().uuid(),
    asOf: z.string().datetime({ offset: true }),
    status: projectLabourReconciliationStatusSchema,
    rows: z.array(projectLabourReconciliationRowSchema),
    totals: projectLabourReconciliationTotalsSchema,
    notes: z.array(z.string().trim().min(1).max(500)),
  })
  .strict()

export type ProjectLabourReconciliationEvidence = z.infer<
  typeof projectLabourReconciliationEvidenceSchema
>
export type ProjectLabourReconciliationStatus = z.infer<
  typeof projectLabourReconciliationStatusSchema
>
export type ProjectLabourReconciliationQuery = z.infer<
  typeof projectLabourReconciliationQuerySchema
>
export type ProjectLabourReconciliationRow = z.infer<
  typeof projectLabourReconciliationRowSchema
>
export type ProjectLabourReconciliationTotals = z.infer<
  typeof projectLabourReconciliationTotalsSchema
>
export type ProjectLabourReconciliationResult = z.infer<
  typeof projectLabourReconciliationResultSchema
>

export interface ProjectLabourReconciliationTask {
  taskId: string
  level: 'l1' | 'l2' | 'l3' | 'l4'
  taskCode: string
  name: string
  taskStatus: 'planned' | 'in_progress' | 'blocked' | 'completed' | 'cancelled'
  plannedLaborMinutes: number
  actualLaborMinutes: number
}

function integer(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0
}

function utilizationBps(planned: number, actual: number): number | null {
  if (planned <= 0) return null
  return Math.max(0, Math.round((actual * 10_000) / planned))
}

/**
 * Compares planned and actual labour minutes already captured on normalized
 * schedule tasks. It never derives labour cost or invents hours from headcount.
 */
export function buildProjectLabourReconciliationResult(
  projectId: string,
  asOf: string,
  tasks: readonly ProjectLabourReconciliationTask[],
): ProjectLabourReconciliationResult {
  const notes: string[] = []
  const rows = tasks
    .map((task) => {
      const plannedLaborMinutes = Math.max(0, integer(task.plannedLaborMinutes))
      const actualLaborMinutes = Math.max(0, integer(task.actualLaborMinutes))
      const varianceMinutes = actualLaborMinutes - plannedLaborMinutes
      const rowNotes: string[] = []
      let evidence: ProjectLabourReconciliationEvidence = 'reported'
      if (task.taskStatus === 'planned' && actualLaborMinutes === 0) {
        evidence = 'not_due'
      } else if (actualLaborMinutes === 0) {
        evidence = 'missing'
        rowNotes.push('This active, blocked, or completed task has no actual labour minutes reported.')
      }
      if (varianceMinutes > 0) {
        rowNotes.push('Actual labour is above the planned minutes.')
      }
      return projectLabourReconciliationRowSchema.parse({
        taskId: task.taskId,
        level: task.level,
        taskCode: task.taskCode,
        name: task.name,
        taskStatus: task.taskStatus,
        plannedLaborMinutes,
        actualLaborMinutes,
        varianceMinutes,
        utilizationBps: utilizationBps(plannedLaborMinutes, actualLaborMinutes),
        evidence,
        notes: rowNotes,
      })
    })
    .sort(
      (left, right) =>
        right.varianceMinutes - left.varianceMinutes ||
        left.taskCode.localeCompare(right.taskCode),
    )

  const totals = rows.reduce<ProjectLabourReconciliationTotals>(
    (accumulator, row) => ({
      taskCount: accumulator.taskCount + 1,
      plannedLaborMinutes: accumulator.plannedLaborMinutes + row.plannedLaborMinutes,
      actualLaborMinutes: accumulator.actualLaborMinutes + row.actualLaborMinutes,
      varianceMinutes: accumulator.varianceMinutes + row.varianceMinutes,
      reportedTaskCount:
        accumulator.reportedTaskCount + (row.evidence === 'reported' ? 1 : 0),
      missingEvidenceTaskCount:
        accumulator.missingEvidenceTaskCount + (row.evidence === 'missing' ? 1 : 0),
    }),
    {
      taskCount: 0,
      plannedLaborMinutes: 0,
      actualLaborMinutes: 0,
      varianceMinutes: 0,
      reportedTaskCount: 0,
      missingEvidenceTaskCount: 0,
    },
  )

  if (rows.length === 0) {
    notes.push('No normalized schedule tasks are available for labour reconciliation.')
  }
  if (totals.missingEvidenceTaskCount > 0) {
    notes.push('Some active, blocked, or completed tasks have no actual labour evidence.')
  }
  notes.push('Minutes are reconciled as captured schedule evidence; no labour cost or headcount estimate is inferred.')

  return projectLabourReconciliationResultSchema.parse({
    projectId,
    asOf,
    status:
      rows.length === 0
        ? 'unavailable'
        : totals.missingEvidenceTaskCount > 0
          ? 'partial'
          : 'ready',
    rows,
    totals,
    notes,
  })
}
