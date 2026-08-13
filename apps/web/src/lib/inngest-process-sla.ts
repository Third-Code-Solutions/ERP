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
import { and, asc, eq, notInArray } from 'drizzle-orm'
import { inngest } from './inngest'

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

interface Step {
  run: <T>(name: string, operation: () => Promise<T>) => Promise<T>
}

export const processSlaChecker = inngest.createFunction(
  {
    id: 'process-sla-checker',
    name: 'M-06 Process SLA Checker',
    triggers: [{ cron: '*/15 * * * *' as const }],
  },
  async ({ step }: { step: Step }): Promise<ProcessSlaRunSummary> => {
    const summary: ProcessSlaRunSummary = {
      processed: 0,
      changed: 0,
      breached: 0,
      escalated: 0,
      externalBreached: 0,
      errors: 0,
    }

    if (process.env.PROCESS_SLA_ENGINE_ENABLED !== '1') {
      return { ...summary, disabled: true }
    }

    const rows = await step.run('load-open-process-sla-clocks', async () =>
      db
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
        .where(
          notInArray(slaClocks.status, ['paused', 'completed', 'cancelled', 'escalated'])
        )
        .orderBy(asc(slaClocks.due_at))
        .limit(1_000)
    )

    const now = new Date()
    for (const row of rows) {
      summary.processed += 1
      try {
        const result = await step.run(`evaluate-process-sla-${row.id}`, async () => {
          const transition = deriveProcessSlaTransition(row, now)
          if (!transition.changed) return transition

          const [updated] = await db
            .update(slaClocks)
            .set({
              status: transition.status,
              breached_at: transition.breached_at,
              escalated_at: transition.escalated_at,
              updated_at: now,
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

          return { ...transition, changed: Boolean(updated) }
        })

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

    return summary
  }
)
