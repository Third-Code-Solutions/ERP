/**
 * Permit staleness checker Inngest cron (REFACTOR.md §7.4).
 *
 * Runs daily at 00:00 UTC (08:00 PHT). For each permit row where
 * `status NOT IN ('approved', 'rejected', 'released', 'refunded', 'cancelled')` and `last_status_change_at <
 * now - INTERVAL '7 days'`, dispatch an in-app + email notification to
 * the project's site PM/PE channel plus admin/owner.
 *
 * Mirrors supabase/functions/permit-staleness-checker but uses the
 * existing Inngest connection so no extra deploy step is required.
 *
 * Each per-permit notification fires inside its own step.run for safe
 * retries; per-row failures are swallowed into the summary count so a
 * single bad permit never crashes the entire sweep.
 */

import { and, eq, lt, notInArray } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import { permits, projects } from '@third-code-erp/database/schema'
import { notifyRoles } from '@/lib/operations/notifications'
import { inngest } from '@/lib/inngest'

const STALE_THRESHOLD_DAYS = 7
const STALE_RECIPIENT_ROLES = ['sd_pm_pe', 'admin', 'owner'] as const
const TERMINAL_STATUSES = ['approved', 'rejected', 'released', 'refunded', 'cancelled'] as const

interface Step {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>
}

interface PermitRunSummary {
  processed: number
  errors: number
}

function siteBase(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    'http://localhost:3000'
  )
}

export const permitStalenessChecker = inngest.createFunction(
  {
    id: 'permit-staleness-checker',
    name: 'Permit Staleness Checker (daily, 7d threshold)',
    triggers: [{ cron: '0 0 * * *' as const }],
  },
  async ({ step }: { step: Step }): Promise<PermitRunSummary> => {
    const summary: PermitRunSummary = { processed: 0, errors: 0 }
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_DAYS * 86_400 * 1000)

    let staleRows: Array<{
      id: string
      tenant_id: string
      project_id: string
      permit_type: string
      status: string
      project_name: string | null
    }> = []

    try {
      staleRows = await step.run('load-stale-permits', async () =>
        db
          .select({
            id: permits.id,
            tenant_id: permits.tenant_id,
            project_id: permits.project_id,
            permit_type: permits.permit_type,
            status: permits.status,
            project_name: projects.name,
          })
          .from(permits)
          .leftJoin(projects, eq(projects.id, permits.project_id))
          .where(
            and(
              notInArray(permits.status, [...TERMINAL_STATUSES]),
              lt(permits.last_status_change_at, cutoff)
            )
          )
          .limit(500)
      )
    } catch {
      summary.errors = 1
      return summary
    }

    for (const row of staleRows) {
      try {
        await step.run(`notify-${row.id}`, async () => {
          const projectName = row.project_name ?? 'Unknown project'
          const linkUrl = `${siteBase()}/projects/${row.project_id}/permits`
          await notifyRoles({
            tenantId: row.tenant_id,
            recipientRoles: [...STALE_RECIPIENT_ROLES],
            subject: `Permit stale: ${row.permit_type} on ${projectName}`,
            body: `Permit "${row.permit_type}" on ${projectName} has been in status "${row.status}" for over ${STALE_THRESHOLD_DAYS} days.`,
            linkUrl,
            alsoEmail: true,
            templateId: 'sla-breach',
            templateVars: {
              entity_label: row.permit_type,
              sla_label: 'permit_status_update',
              project_name: projectName,
              link_url: linkUrl,
            },
          })
        })
        summary.processed += 1
      } catch {
        summary.errors += 1
        // Continue — one bad permit shouldn't poison the sweep.
      }
    }

    return summary
  }
)
