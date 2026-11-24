import type { AppRole } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  permits,
  preConChecklistItems,
  preConChecklists,
  projects,
  slaLogs,
} from '@third-code-erp/database/schema'
import { and, asc, eq, inArray, isNull, sql, type AnyColumn } from 'drizzle-orm'
import { errorChainMessage, errorChainSqlState } from '@/lib/error-chain-message'
import { resolveTenantBusinessDayService } from '@/lib/operations/business-calendar'
import { canViewPath } from '@/lib/operations/nav-config'
import {
  buildOpenDeadlines,
  humanizeCode,
  subjectKey,
  visibleDeadlineEntityTypes,
  type DeadlineSubject,
  type OpenDeadline,
  type OpenSlaLogRow,
} from '@/lib/operations/sla-clock-deadlines'

/** Open clocks read per request, earliest approximate due time first. */
export const OPEN_CLOCK_ROW_LIMIT = 500
/** Rows rendered, most urgent first. */
export const DEADLINE_DISPLAY_LIMIT = 50

export type OpenDeadlinesResult =
  | {
      ok: true
      deadlines: OpenDeadline[]
      /** Open deadlines the viewer may see, before the display limit. */
      total: number
      /** True when more open clocks exist than were read. */
      truncated: boolean
    }
  | { ok: false }

function entityIds(rows: readonly OpenSlaLogRow[], entityType: string): string[] {
  return [
    ...new Set(
      rows.filter((row) => row.entity_type === entityType).map((row) => row.entity_id)
    ),
  ]
}

/**
 * A lower bound of each clock's due time, for reading the likeliest-late clocks
 * first: calendar hours exactly, business days as (days - 1) calendar days
 * (the start day counts in full). An unreadable config sorts by its start.
 */
const approximateDueAt = sql`${slaLogs.started_at} + make_interval(secs => coalesce(
  case when jsonb_typeof(${slaLogs.sla_seconds} -> 'breach_at_seconds') = 'number'
    then (${slaLogs.sla_seconds} ->> 'breach_at_seconds')::double precision end,
  case when jsonb_typeof(${slaLogs.sla_seconds} -> 'breach_business_days') = 'number'
    then ((${slaLogs.sla_seconds} ->> 'breach_business_days')::double precision - 1) * 86400 end,
  0))`

/**
 * Permits and checklist items only know their own id, but their links need the
 * project. A retired project gives no link (its pages are not found). Everything
 * is tenant-scoped and one query per type.
 */
function liveProject(projectId: AnyColumn, tenantId: string) {
  return and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId), isNull(projects.deleted_at))
}

async function loadSubjects(
  tenantId: string,
  rows: readonly OpenSlaLogRow[]
): Promise<Map<string, DeadlineSubject>> {
  const subjects = new Map<string, DeadlineSubject>()
  const permitIds = entityIds(rows, 'permit')
  const itemIds = entityIds(rows, 'pre_con_checklist_item')

  const [permitRows, itemRows] = await Promise.all([
    permitIds.length === 0
      ? []
      : db
          .select({
            id: permits.id,
            projectId: projects.id,
            permitType: permits.permit_type,
            lguName: permits.lgu_name,
          })
          .from(permits)
          .leftJoin(projects, liveProject(permits.project_id, tenantId))
          .where(and(eq(permits.tenant_id, tenantId), inArray(permits.id, permitIds))),
    itemIds.length === 0
      ? []
      : db
          .select({
            id: preConChecklistItems.id,
            title: preConChecklistItems.title,
            projectId: projects.id,
          })
          .from(preConChecklistItems)
          .innerJoin(
            preConChecklists,
            and(
              eq(preConChecklists.id, preConChecklistItems.checklist_id),
              eq(preConChecklists.tenant_id, tenantId)
            )
          )
          .leftJoin(projects, liveProject(preConChecklists.project_id, tenantId))
          .where(
            and(
              eq(preConChecklistItems.tenant_id, tenantId),
              inArray(preConChecklistItems.id, itemIds)
            )
          ),
  ])

  for (const permit of permitRows) {
    subjects.set(subjectKey('permit', permit.id), {
      projectId: permit.projectId,
      name: permit.lguName
        ? `${humanizeCode(permit.permitType)} (${permit.lguName})`
        : humanizeCode(permit.permitType),
    })
  }
  for (const item of itemRows) {
    subjects.set(subjectKey('pre_con_checklist_item', item.id), {
      projectId: item.projectId,
      name: item.title,
    })
  }
  return subjects
}

/**
 * Open deadlines for one tenant, read from `sla_logs` and judged at request
 * time. Rows whose subject the role cannot open are left out. A failure is
 * reported as `{ ok: false }` so the rest of the page still renders.
 */
export async function loadOpenDeadlines(
  tenantId: string,
  role: AppRole,
  now: Date = new Date()
): Promise<OpenDeadlinesResult> {
  const canView = (href: string) => canViewPath(role, href)
  // Filter by type in SQL so the row cap only counts clocks this role may see.
  const entityTypes = visibleDeadlineEntityTypes(canView)
  if (entityTypes.length === 0) {
    return { ok: true, deadlines: [], total: 0, truncated: false }
  }
  try {
    const rows: OpenSlaLogRow[] = await db
      .select({
        id: slaLogs.id,
        entity_type: slaLogs.entity_type,
        entity_id: slaLogs.entity_id,
        sla_label: slaLogs.sla_label,
        started_at: slaLogs.started_at,
        sla_seconds: slaLogs.sla_seconds,
      })
      .from(slaLogs)
      .where(
        and(
          eq(slaLogs.tenant_id, tenantId),
          isNull(slaLogs.completed_at),
          inArray(slaLogs.entity_type, entityTypes)
        )
      )
      .orderBy(asc(approximateDueAt), asc(slaLogs.started_at))
      .limit(OPEN_CLOCK_ROW_LIMIT)

    if (rows.length === 0) {
      return { ok: true, deadlines: [], total: 0, truncated: false }
    }

    const [businessDays, subjects] = await Promise.all([
      resolveTenantBusinessDayService(tenantId),
      loadSubjects(tenantId, rows),
    ])
    const deadlines = buildOpenDeadlines({
      rows,
      now,
      businessDays,
      subjects,
      canView,
    })
    return {
      ok: true,
      deadlines: deadlines.slice(0, DEADLINE_DISPLAY_LIMIT),
      total: deadlines.length,
      truncated: rows.length === OPEN_CLOCK_ROW_LIMIT,
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        action: 'process.open-deadlines',
        outcome: 'failure',
        // Server log only: the chain carries SQL text, never returned to the page.
        error: errorChainMessage(error) || 'unknown',
        code: errorChainSqlState(error) ?? null,
      })
    )
    return { ok: false }
  }
}
