/**
 * Cadence engine Inngest wiring.
 *
 * Two surfaces:
 *   1. `generateDailyCadenceTasks` — cron at 23:00 UTC, which is 07:00 next
 *      day Manila time. For every tenant, generate the day's tasks. We
 *      target the current Manila calendar date so that by the time site teams
 *      log in at 07:00 Manila the tasks for that working day are queued.
 *   2. `generateOnDemand` — event-driven so an admin UI (or another job)
 *      can force a generation for `{ tenantId, date }`.
 *
 * The functions live in their own file so this module can be registered
 * alongside the existing `inngest.ts` without colliding with the CAD/BOM
 * pipeline declared there.
 */

import { db } from '@third-code-erp/database'
import { tenants } from '@third-code-erp/database/schema'
import { inngest } from './inngest'
import { generateTasksForDate, manilaCalendarDate } from './operations/cadence-engine'

type Step = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>
}

interface OnDemandEventData {
  tenantId: string
  /** ISO date string. Defaults to today (Manila) if missing. */
  date?: string
  actorId?: string
}

interface GenerationSummary {
  tenantId: string
  created: number
  skipped: number
  projectsConsidered: number
}

export const generateDailyCadenceTasks = inngest.createFunction(
  {
    id: 'generate-daily-cadence-tasks',
    name: 'Generate Daily Cadence Tasks (per tenant)',
    // 23:00 UTC daily = 07:00 Manila next day.
    triggers: [{ cron: '0 23 * * *' }],
  },
  async ({ step }: { step: Step }) => {
    const targetDate = manilaCalendarDate(new Date())

    const tenantList = await step.run('load-tenants', async () => {
      return db.select({ id: tenants.id }).from(tenants)
    })

    const summaries: GenerationSummary[] = []
    for (const tenant of tenantList) {
      const summary = await step.run(`generate-${tenant.id}`, async () => {
        const result = await generateTasksForDate(tenant.id, targetDate)
        return { tenantId: tenant.id, ...result }
      })
      summaries.push(summary)
    }

    const totalCreated = summaries.reduce((acc, s) => acc + s.created, 0)
    return {
      date: targetDate.toISOString(),
      tenantCount: tenantList.length,
      totalCreated,
      summaries,
    }
  },
)

export const generateOnDemand = inngest.createFunction(
  {
    id: 'generate-cadence-on-demand',
    name: 'Generate Cadence Tasks On Demand',
    triggers: [{ event: 'cadence/generate.requested' as const }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: OnDemandEventData }
    step: Step
  }) => {
    const { tenantId, date } = event.data
    if (!tenantId) {
      return { skipped: true, reason: 'tenantId missing' }
    }

    const targetDate = date ? new Date(date) : manilaCalendarDate(new Date())
    if (Number.isNaN(targetDate.getTime())) {
      return { skipped: true, reason: 'invalid date' }
    }

    const result = await step.run('generate', async () => {
      return generateTasksForDate(tenantId, targetDate)
    })

    return { tenantId, date: targetDate.toISOString(), ...result }
  },
)
