/**
 * Cadence engine Inngest wiring.
 *
 * `generateDailyCadenceTasks` — cron at 23:00 UTC, which is 07:00 next day
 * Manila time. For every tenant, generate the day's tasks. We target the
 * current Manila calendar date so that by the time site teams log in at 07:00
 * Manila the tasks for that working day are queued. Admins generate on demand
 * through the /tasks server action, which calls the engine directly.
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
