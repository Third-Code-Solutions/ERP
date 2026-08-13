/**
 * SLA checker Inngest cron (REFACTOR.md §7.4).
 *
 * Runs every 30 minutes. For each open `sla_logs` row (completed_at IS NULL
 * AND breached_at IS NULL):
 *   - Compute business-day or calendar-hour progress from the stored config.
 *   - At 100%, set breached_at = now and dispatch a breach notification.
 *   - At the configured warning threshold, set warned_at = now and dispatch
 *     an in-app-only warning.
 *
 * Mirrors the Deno function at supabase/functions/sla-checker but runs
 * via the Inngest connection already wired for the Next.js app — no extra
 * deploy step.
 *
 * Each per-row mutation is wrapped in its own step.run so Inngest retries
 * are safe (the warned_at / breached_at guards make the work idempotent).
 */

import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import { slaLogs } from '@third-code-erp/database/schema'
import { notifyRoles } from '@/lib/operations/notifications'
import { inngest } from '@/lib/inngest'
import { getSlaProgress, parseSlaConfig } from '@/lib/operations/sla-clock-utils'
import { resolveTenantBusinessDayService } from '@/lib/operations/business-calendar'

const ADMIN_ROLES = ['admin', 'owner'] as const

interface Step {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>
}

interface SlaRunSummary {
  processed: number
  breached: number
  warned: number
  errors: number
}

function siteBase(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    'http://localhost:3000'
  )
}

function entityLabel(entityType: string, entityId: string): string {
  return `${entityType}:${entityId.slice(0, 8)}`
}

export const slaChecker = inngest.createFunction(
  {
    id: 'sla-checker',
    name: 'SLA Checker (open sla_logs, warn + breach)',
    triggers: [{ cron: '*/30 * * * *' as const }],
  },
  async ({ step }: { step: Step }): Promise<SlaRunSummary> => {
    const summary: SlaRunSummary = { processed: 0, breached: 0, warned: 0, errors: 0 }

    let openRows: Array<{
      id: string
      tenant_id: string
      entity_type: string
      entity_id: string
      sla_label: string
      started_at: Date
      sla_seconds: unknown
      warned_at: Date | null
    }> = []

    try {
      openRows = await step.run('load-open-sla-logs', async () =>
        db
          .select({
            id: slaLogs.id,
            tenant_id: slaLogs.tenant_id,
            entity_type: slaLogs.entity_type,
            entity_id: slaLogs.entity_id,
            sla_label: slaLogs.sla_label,
            started_at: slaLogs.started_at,
            sla_seconds: slaLogs.sla_seconds,
            warned_at: slaLogs.warned_at,
          })
          .from(slaLogs)
          .where(and(isNull(slaLogs.completed_at), isNull(slaLogs.breached_at)))
          .limit(500)
      )
    } catch {
      // Loading failed — surface as a fatal-but-bounded summary; Inngest will
      // retry on schedule. We don't throw because we don't want to alert on
      // a transient DB blip.
      summary.errors = 1
      return summary
    }

    const now = new Date()

    for (const row of openRows) {
      summary.processed += 1
      try {
        await step.run(`process-${row.id}`, async () => {
          const cfg = parseSlaConfig(row.sla_seconds)
          if (!cfg) return { skipped: 'invalid-config' as const }

          const businessDays =
            cfg.clock_type === 'business_days'
              ? await resolveTenantBusinessDayService(row.tenant_id)
              : undefined
          const progress = getSlaProgress(
            cfg,
            new Date(row.started_at),
            now,
            businessDays
          )
          const linkUrl = `${siteBase()}/admin/sla?entity_type=${encodeURIComponent(row.entity_type)}&entity_id=${row.entity_id}`

          if (progress.elapsed >= progress.total) {
            await db
              .update(slaLogs)
              .set({ breached_at: now })
              .where(
                and(
                  eq(slaLogs.id, row.id),
                  eq(slaLogs.tenant_id, row.tenant_id)
                )
              )

            await notifyRoles({
              tenantId: row.tenant_id,
              recipientRoles: [...ADMIN_ROLES],
              subject: `SLA breached: ${row.sla_label}`,
              body: `${row.sla_label} breached on ${entityLabel(row.entity_type, row.entity_id)} after ${progress.elapsed.toFixed(1)} ${progress.unit.replace('_', ' ')}.`,
              linkUrl,
              alsoEmail: true,
              templateId: 'sla-breach',
              templateVars: {
                entity_label: entityLabel(row.entity_type, row.entity_id),
                sla_label: row.sla_label,
                link_url: linkUrl,
              },
            })
            return { breached: true as const }
          }

          if (progress.elapsed >= progress.warning_at && !row.warned_at) {
            await db
              .update(slaLogs)
              .set({ warned_at: now })
              .where(
                and(
                  eq(slaLogs.id, row.id),
                  eq(slaLogs.tenant_id, row.tenant_id)
                )
              )

            await notifyRoles({
              tenantId: row.tenant_id,
              recipientRoles: [...ADMIN_ROLES],
              subject: `SLA approaching breach: ${row.sla_label}`,
              body: `${row.sla_label} on ${entityLabel(row.entity_type, row.entity_id)} is approaching breach (${progress.elapsed.toFixed(1)} of ${progress.total} ${progress.unit.replace('_', ' ')}).`,
              linkUrl,
              // In-app only — no email per spec.
            })
            return { warned: true as const }
          }

          return { skipped: 'within-budget' as const }
        }).then((result) => {
          if (result && 'breached' in result) summary.breached += 1
          else if (result && 'warned' in result) summary.warned += 1
        })
      } catch {
        summary.errors += 1
        // Continue — never let one bad row crash the sweep.
      }
    }

    return summary
  }
)
