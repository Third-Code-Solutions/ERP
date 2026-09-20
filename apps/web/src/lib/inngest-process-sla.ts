/**
 * M-06 process/SLA clock sweep.
 *
 * API commands create immutable schedule snapshots. This worker evaluates
 * those snapshots on a bounded cron and performs optimistic, tenant-scoped
 * status transitions. It is closed by default until hosted M-06 migration,
 * audit coverage, and rollout gates pass.
 */

import { db } from '@third-code-erp/database'
import {
  processSteps,
  slaClocks,
  taskInstances,
} from '@third-code-erp/database/schema'
import {
  evaluateSlaClock,
  type SlaClockEvaluation,
} from '@third-code-erp/shared-types'
import { and, asc, eq, gt, lte, notInArray, or } from 'drizzle-orm'
import { inngest } from './inngest'

const PROCESS_SLA_PAGE_SIZE = 1_000

export type ProcessSlaSweepRow = {
  id: string
  tenant_id: string
  task_instance_id: string
  responsible_bu: string
  clock_type: 'business_days' | 'calendar_hours'
  clock_scope: 'internal' | 'external'
  target_value: number
  started_at: Date
  at_risk_at: Date
  due_at: Date
  escalation_at: Date | null
  status: 'running' | 'paused' | 'breached' | 'escalated' | 'completed' | 'cancelled'
  observe_mode: boolean
  breached_at: Date | null
  escalated_at: Date | null
  updated_at: Date
}

type ProcessSlaSweepDateField =
  | 'started_at'
  | 'at_risk_at'
  | 'due_at'
  | 'escalation_at'
  | 'breached_at'
  | 'escalated_at'
  | 'updated_at'

export type ProcessSlaSweepRowDto = Omit<
  ProcessSlaSweepRow,
  ProcessSlaSweepDateField
> & {
  started_at: string
  at_risk_at: string
  due_at: string
  escalation_at: string | null
  breached_at: string | null
  escalated_at: string | null
  updated_at: string
}

export type ProcessSlaTransition = {
  status: ProcessSlaSweepRow['status']
  breached_at: Date | null
  escalated_at: Date | null
  evaluation: SlaClockEvaluation
  changed: boolean
}

export type ProcessSlaRunSummary = {
  disabled?: boolean
  processed: number
  changed: number
  breached: number
  escalated: number
  externalBreached: number
  errors: number
}

type ProcessSlaEvaluationResult = Pick<
  ProcessSlaTransition,
  'evaluation' | 'changed'
>

export function deriveProcessSlaTransition(
  row: Pick<
    ProcessSlaSweepRow,
    | 'clock_type'
    | 'clock_scope'
    | 'target_value'
    | 'started_at'
    | 'at_risk_at'
    | 'due_at'
    | 'escalation_at'
    | 'observe_mode'
    | 'status'
    | 'breached_at'
    | 'escalated_at'
  >,
  now: Date
): ProcessSlaTransition {
  const evaluation = evaluateSlaClock(
    {
      clock_type: row.clock_type,
      clock_scope: row.clock_scope,
      target_value: row.target_value,
      observe_mode: row.observe_mode,
      started_at: row.started_at,
      at_risk_at: row.at_risk_at,
      due_at: row.due_at,
      escalation_at: row.escalation_at,
    },
    now
  )

  const status = evaluation.should_escalate
    ? 'escalated'
    : evaluation.is_breached && row.status === 'running'
      ? 'breached'
      : row.status
  const breached_at =
    row.breached_at ?? (evaluation.is_breached ? now : null)
  const escalated_at =
    row.escalated_at ?? (evaluation.should_escalate ? now : null)

  return {
    status,
    breached_at,
    escalated_at,
    evaluation,
    changed:
      status !== row.status ||
      breached_at !== row.breached_at ||
      escalated_at !== row.escalated_at,
  }
}

function reviveProcessSlaDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw new TypeError(`Process SLA row ${field} must be an ISO timestamp`)
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Process SLA row ${field} must be a valid timestamp`)
  }
  return date
}

function reviveNullableProcessSlaDate(
  value: unknown,
  field: string
): Date | null {
  return value === null ? null : reviveProcessSlaDate(value, field)
}

export function serializeProcessSlaSweepRow(
  row: ProcessSlaSweepRow
): ProcessSlaSweepRowDto {
  return {
    ...row,
    started_at: row.started_at.toISOString(),
    at_risk_at: row.at_risk_at.toISOString(),
    due_at: row.due_at.toISOString(),
    escalation_at: row.escalation_at?.toISOString() ?? null,
    breached_at: row.breached_at?.toISOString() ?? null,
    escalated_at: row.escalated_at?.toISOString() ?? null,
    updated_at: row.updated_at.toISOString(),
  }
}

export function reviveProcessSlaSweepRow(
  row: ProcessSlaSweepRowDto
): ProcessSlaSweepRow {
  if (row === null || typeof row !== 'object') {
    throw new TypeError('Process SLA row must be an object')
  }

  return {
    ...row,
    started_at: reviveProcessSlaDate(row.started_at, 'started_at'),
    at_risk_at: reviveProcessSlaDate(row.at_risk_at, 'at_risk_at'),
    due_at: reviveProcessSlaDate(row.due_at, 'due_at'),
    escalation_at: reviveNullableProcessSlaDate(
      row.escalation_at,
      'escalation_at'
    ),
    breached_at: reviveNullableProcessSlaDate(
      row.breached_at,
      'breached_at'
    ),
    escalated_at: reviveNullableProcessSlaDate(
      row.escalated_at,
      'escalated_at'
    ),
    updated_at: reviveProcessSlaDate(row.updated_at, 'updated_at'),
  }
}

export interface ProcessSlaSweepStep {
  run: <T>(name: string, operation: () => Promise<T>) => Promise<T>
}

export type ProcessSlaSweepCursor = Pick<
  ProcessSlaSweepRow,
  'due_at' | 'id'
>

export interface ProcessSlaSweepStore {
  loadOpenClocks(input: {
    cursor: ProcessSlaSweepCursor | null
    sweepAt: Date
  }): Promise<ProcessSlaSweepRowDto[]>
  compareAndSetClock(input: {
    row: ProcessSlaSweepRow
    transition: ProcessSlaTransition
    sweepAt: Date
  }): Promise<boolean>
}

function createProcessSlaSweepStore(): ProcessSlaSweepStore {
  return {
    loadOpenClocks: async ({ cursor, sweepAt }) => {
      const eligible = and(
        notInArray(slaClocks.status, [
          'paused',
          'completed',
          'cancelled',
          'escalated',
        ]),
        lte(slaClocks.due_at, sweepAt)
      )
      const afterCursor = cursor
        ? or(
            gt(slaClocks.due_at, cursor.due_at),
            and(
              eq(slaClocks.due_at, cursor.due_at),
              gt(slaClocks.id, cursor.id)
            )
          )
        : undefined

      const rows = await db
        .select({
          id: slaClocks.id,
          tenant_id: slaClocks.tenant_id,
          task_instance_id: slaClocks.task_instance_id,
          responsible_bu: processSteps.responsible_bu,
          clock_type: slaClocks.clock_type,
          clock_scope: slaClocks.clock_scope,
          target_value: slaClocks.target_value,
          started_at: slaClocks.started_at,
          at_risk_at: slaClocks.at_risk_at,
          due_at: slaClocks.due_at,
          escalation_at: slaClocks.escalation_at,
          status: slaClocks.status,
          observe_mode: slaClocks.observe_mode,
          breached_at: slaClocks.breached_at,
          escalated_at: slaClocks.escalated_at,
          updated_at: slaClocks.updated_at,
        })
        .from(slaClocks)
        .innerJoin(
          taskInstances,
          and(
            eq(slaClocks.task_instance_id, taskInstances.id),
            eq(slaClocks.tenant_id, taskInstances.tenant_id)
          )
        )
        .innerJoin(
          processSteps,
          and(
            eq(taskInstances.process_step_id, processSteps.id),
            eq(taskInstances.tenant_id, processSteps.tenant_id)
          )
        )
        .where(afterCursor ? and(eligible, afterCursor) : eligible)
        .orderBy(asc(slaClocks.due_at), asc(slaClocks.id))
        .limit(PROCESS_SLA_PAGE_SIZE)

      return rows.map(serializeProcessSlaSweepRow)
    },
    compareAndSetClock: async ({ row, transition, sweepAt }) => {
      const [updated] = await db
        .update(slaClocks)
        .set({
          status: transition.status,
          breached_at: transition.breached_at,
          escalated_at: transition.escalated_at,
          updated_at: sweepAt,
        })
        .where(
          and(
            eq(slaClocks.id, row.id),
            eq(slaClocks.tenant_id, row.tenant_id),
            eq(slaClocks.status, row.status),
            eq(slaClocks.updated_at, row.updated_at)
          )
        )
        .returning({ id: slaClocks.id })

      return Boolean(updated)
    },
  }
}

export async function runProcessSlaSweep(
  step: ProcessSlaSweepStep,
  store: ProcessSlaSweepStore,
  sweepAt: Date
): Promise<ProcessSlaRunSummary> {
  const summary: ProcessSlaRunSummary = {
    processed: 0,
    changed: 0,
    breached: 0,
    escalated: 0,
    externalBreached: 0,
    errors: 0,
  }

  let cursor: ProcessSlaSweepCursor | null = null
  let page = 0

  while (true) {
    const serializedRows = await step.run(
      page === 0
        ? 'load-open-process-sla-clocks'
        : `load-open-process-sla-clocks-page-${page}`,
      () => store.loadOpenClocks({ cursor, sweepAt })
    )
    const rows = serializedRows.map(reviveProcessSlaSweepRow)

    if (rows.length === 0) break

    for (const row of rows) {
      summary.processed += 1
      try {
        const result = await step.run<ProcessSlaEvaluationResult>(
          `evaluate-process-sla-${row.id}`,
          async () => {
            const transition = deriveProcessSlaTransition(row, sweepAt)
            if (!transition.changed) {
              return {
                evaluation: transition.evaluation,
                changed: false,
              }
            }

            return {
              evaluation: transition.evaluation,
              changed: await store.compareAndSetClock({
                row,
                transition,
                sweepAt,
              }),
            }
          }
        )

        if (!result.changed) continue
        summary.changed += 1
        if (result.evaluation.is_breached) {
          summary.breached += 1
          if (row.clock_scope === 'external') summary.externalBreached += 1
        }
        if (result.evaluation.should_escalate) summary.escalated += 1
      } catch {
        summary.errors += 1
      }
    }

    const last = rows.at(-1)
    if (!last) break
    cursor = { due_at: last.due_at, id: last.id }
    page += 1
    if (rows.length < PROCESS_SLA_PAGE_SIZE) break
  }

  return summary
}

export const processSlaChecker = inngest.createFunction(
  {
    id: 'process-sla-checker',
    name: 'M-06 Process SLA Checker',
    triggers: [{ cron: '*/15 * * * *' as const }],
  },
  async ({ step }: { step: ProcessSlaSweepStep }): Promise<ProcessSlaRunSummary> => {
    if (process.env.PROCESS_SLA_ENGINE_ENABLED !== '1') {
      return {
        disabled: true,
        processed: 0,
        changed: 0,
        breached: 0,
        escalated: 0,
        externalBreached: 0,
        errors: 0,
      }
    }

    const sweepAtIso = await step.run(
      'capture-process-sla-sweep-at',
      async () => new Date().toISOString()
    )
    const sweepAt = reviveProcessSlaDate(sweepAtIso, 'sweepAt')

    return runProcessSlaSweep(step, createProcessSlaSweepStore(), sweepAt)
  }
)
