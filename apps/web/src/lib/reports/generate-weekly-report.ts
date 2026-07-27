// Phase 10 (Rework-alignment) — Weekly Report orchestrator.
//
// Builds a `weekly_reports` row + HTML artifact for a single project/week.
// Designed to be invoked from a server action ("Generate this week") or
// future scheduler / cron worker. Idempotent per (project_id, week_ending)
// — re-running overwrites the snapshot and re-uploads the HTML.
//
// Storage layout for the rendered artifact (private bucket):
//   {tenant_id}/{project_id}/weekly-report-{ts}.html
//
// Best-effort posture: if storage upload fails, we still persist the JSONB
// row so the report is queryable and re-runnable. We only return after
// audit-logging.

import { and, desc, eq, gte, lte, ne } from 'drizzle-orm'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import { db } from '@third-code-erp/database'
import {
  accounts,
  dailyTasks,
  documents,
  masterSchedules,
  progressUpdates,
  projects,
  punchlistItems,
  tenants,
  users,
  variationOrders,
  weeklyReports,
} from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
import {
  buildWeeklyReportHtml,
  type WeeklyReportSnapshot,
} from './weekly-report-template'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

type ProgressByCategory = {
  civil_pct?: number
  electrical_pct?: number
  mep_pct?: number
  finishes_pct?: number
  overall_pct?: number
}

type MasterTask = {
  name: string
  start_date: string
  finish_date: string
  predecessor_index: number | null
  planned_pct_curve: number[]
}

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

/**
 * Compute schedule variance in days. Positive = ahead of plan,
 * negative = behind. We compare the latest `progress_updates.overall_pct`
 * against the planned curve in `master_schedules.tasks`, indexed by the
 * number of weeks elapsed since the earliest task start_date.
 *
 * Falls back to 0 when there's no schedule or no progress data.
 */
function computeScheduleVarianceDays(
  schedule: { tasks: unknown } | null,
  actualOverallPct: number,
  weekEnding: Date
): number {
  if (!schedule) return 0
  const tasks = Array.isArray(schedule.tasks) ? (schedule.tasks as MasterTask[]) : []
  if (tasks.length === 0) return 0

  // Earliest start date across the master schedule.
  const startDates = tasks
    .map((t) => new Date(t.start_date).getTime())
    .filter((t) => Number.isFinite(t))
  if (startDates.length === 0) return 0
  const earliest = Math.min(...startDates)

  // Week index relative to project start, 0-based.
  const elapsedWeeks = Math.max(
    0,
    Math.floor((weekEnding.getTime() - earliest) / WEEK_MS)
  )

  // Project-level planned curve = per-week average of all task curves,
  // padded to the longest task with each task's final value (mirrors the
  // logic used on the /progress page).
  const maxLen = tasks.reduce((m, t) => Math.max(m, t.planned_pct_curve.length), 0)
  if (maxLen === 0) return 0
  const plannedCurve: number[] = []
  for (let w = 0; w < maxLen; w++) {
    let sum = 0
    let count = 0
    for (const t of tasks) {
      const v = t.planned_pct_curve[w]
      if (typeof v === 'number') {
        sum += v
        count++
      } else if (t.planned_pct_curve.length > 0) {
        sum += t.planned_pct_curve[t.planned_pct_curve.length - 1]!
        count++
      }
    }
    plannedCurve.push(count > 0 ? sum / count : 0)
  }

  const plannedThisWeek = plannedCurve[Math.min(elapsedWeeks, plannedCurve.length - 1)] ?? 0

  // Approximate variance days: difference in %, mapped to weeks via
  // average weekly velocity (last 4 weeks of plan), converted to days.
  const tail = plannedCurve.slice(-4)
  const lastVelocityPct =
    tail.length > 1
      ? Math.max(0.5, (tail[tail.length - 1]! - tail[0]!) / (tail.length - 1))
      : 1
  const deltaPct = actualOverallPct - plannedThisWeek
  const varianceWeeks = deltaPct / lastVelocityPct
  return Math.round(varianceWeeks * 7)
}

export async function generateWeeklyReportForProject(
  tenantId: string,
  projectId: string,
  weekEnding: Date,
  actorId: string
): Promise<{ id: string }> {
  if (!tenantId) throw new Error('tenantId is required')
  if (!projectId) throw new Error('projectId is required')
  if (!actorId) throw new Error('actorId is required')
  if (!(weekEnding instanceof Date) || Number.isNaN(weekEnding.getTime())) {
    throw new Error('weekEnding must be a valid Date')
  }

  // Tenant-scope the project lookup defensively — generator may be called
  // from a worker that doesn't otherwise gate by tenant.
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      client: projects.client,
      location: projects.location,
      account_id: projects.account_id,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId)))
    .limit(1)

  if (!project) throw new Error('Project not found in tenant')

  const weekStart = new Date(weekEnding.getTime() - WEEK_MS)

  // 1. Most recent progress update at or before weekEnding.
  // 2. Completed tasks during the week.
  // 3. Open punchlist count.
  // 4. Master schedule for variance.
  // 5. VOs signed in the week → treated as milestones.
  // 6. Account row for the header.
  // Run in parallel since they are independent reads.
  const [
    latestProgressRows,
    completedTaskRows,
    openPunchlistRows,
    scheduleRows,
    voMilestoneRows,
    accountRows,
    tenantRows,
    actorRows,
  ] = await Promise.all([
    db
      .select({
        id: progressUpdates.id,
        week_ending: progressUpdates.week_ending,
        percent_by_category: progressUpdates.percent_by_category,
        notes: progressUpdates.notes,
      })
      .from(progressUpdates)
      .where(
        and(
          eq(progressUpdates.tenant_id, tenantId),
          eq(progressUpdates.project_id, projectId),
          lte(progressUpdates.week_ending, weekEnding)
        )
      )
      .orderBy(desc(progressUpdates.week_ending))
      .limit(1),
    db
      .select({
        id: dailyTasks.id,
        title: dailyTasks.title,
        completed_at: dailyTasks.completed_at,
        completed_by: dailyTasks.completed_by,
        assignee_id: dailyTasks.assignee_id,
      })
      .from(dailyTasks)
      .where(
        and(
          eq(dailyTasks.tenant_id, tenantId),
          eq(dailyTasks.project_id, projectId),
          eq(dailyTasks.status, 'done'),
          gte(dailyTasks.completed_at, weekStart),
          lte(dailyTasks.completed_at, weekEnding)
        )
      ),
    db
      .select({ id: punchlistItems.id })
      .from(punchlistItems)
      .where(
        and(
          eq(punchlistItems.tenant_id, tenantId),
          eq(punchlistItems.project_id, projectId),
          ne(punchlistItems.status, 'closed')
        )
      ),
    db
      .select({
        id: masterSchedules.id,
        tasks: masterSchedules.tasks,
      })
      .from(masterSchedules)
      .where(
        and(
          eq(masterSchedules.tenant_id, tenantId),
          eq(masterSchedules.project_id, projectId)
        )
      )
      .orderBy(desc(masterSchedules.imported_at))
      .limit(1),
    db
      .select({
        id: variationOrders.id,
        vo_number: variationOrders.vo_number,
        description: variationOrders.description,
        signed_at: variationOrders.signed_at,
      })
      .from(variationOrders)
      .where(
        and(
          eq(variationOrders.tenant_id, tenantId),
          eq(variationOrders.project_id, projectId),
          eq(variationOrders.status, 'signed'),
          gte(variationOrders.signed_at, weekStart),
          lte(variationOrders.signed_at, weekEnding)
        )
      ),
    project.account_id
      ? db
          .select({
            id: accounts.id,
            name: accounts.name,
            billing_address: accounts.billing_address,
          })
          .from(accounts)
          .where(eq(accounts.id, project.account_id))
          .limit(1)
      : Promise.resolve([] as Array<{ id: string; name: string; billing_address: string | null }>),
    db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
    db
      .select({ id: users.id, full_name: users.full_name, email: users.email })
      .from(users)
      .where(eq(users.id, actorId))
      .limit(1),
  ])

  // Resolve assignee names for completed-tasks display. We do one batched
  // user lookup rather than N round-trips.
  const assigneeIds = Array.from(
    new Set(
      completedTaskRows
        .map((t) => t.completed_by ?? t.assignee_id)
        .filter((v): v is string => typeof v === 'string')
    )
  )
  const assigneeRows =
    assigneeIds.length > 0
      ? await db
          .select({ id: users.id, full_name: users.full_name, email: users.email })
          .from(users)
          .where(eq(users.tenant_id, tenantId))
      : []
  const userById = new Map(
    assigneeRows.map((u) => [u.id, u.full_name ?? u.email ?? null] as const)
  )

  const latestProgress = latestProgressRows[0] ?? null
  const pct = (latestProgress?.percent_by_category ?? {}) as ProgressByCategory

  const overallPct = n(pct.overall_pct)
  const schedule = scheduleRows[0] ?? null
  const variance = computeScheduleVarianceDays(schedule, overallPct, weekEnding)

  // Build the snapshot. We keep field shapes loose-but-typed so the
  // template renders empty states cleanly when data is missing.
  const snapshot: WeeklyReportSnapshot = {
    overall_pct: overallPct,
    by_category: {
      civil_pct: n(pct.civil_pct),
      electrical_pct: n(pct.electrical_pct),
      mep_pct: n(pct.mep_pct),
      finishes_pct: n(pct.finishes_pct),
    },
    tasks_completed: completedTaskRows
      .filter((t) => t.completed_at !== null)
      .sort((a, b) => {
        const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0
        const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0
        return tb - ta
      })
      .map((t) => ({
        title: t.title,
        assignee:
          userById.get(t.completed_by ?? '') ??
          userById.get(t.assignee_id ?? '') ??
          null,
        completed_at: t.completed_at
          ? new Date(t.completed_at).toISOString()
          : new Date(weekEnding).toISOString(),
      })),
    milestones_reached: voMilestoneRows
      .filter((v) => v.signed_at !== null)
      .map((v) => ({
        title: `VO ${v.vo_number} signed — ${v.description.slice(0, 80)}`,
        date: v.signed_at!.toISOString(),
      })),
    open_punchlist_count: openPunchlistRows.length,
    schedule_variance_days: variance,
    photos: [],
    notes: latestProgress?.notes ?? '',
    next_week_focus: '',
  }

  // Upsert by (project_id, week_ending). The unique index on the table
  // (idx_weekly_reports_project_week) backs this conflict target.
  const generatedAt = new Date()
  const [inserted] = await db
    .insert(weeklyReports)
    .values({
      tenant_id: tenantId,
      project_id: projectId,
      week_ending: weekEnding,
      snapshot,
      generated_at: generatedAt,
      generated_by: actorId,
    })
    .onConflictDoUpdate({
      target: [weeklyReports.project_id, weeklyReports.week_ending],
      set: {
        snapshot,
        generated_at: generatedAt,
        generated_by: actorId,
        // Clear the prior document link; we re-upload below.
        report_document_id: null,
      },
    })
    .returning({ id: weeklyReports.id })

  const reportId = inserted!.id

  // Build the HTML artifact.
  const tenant = tenantRows[0] ?? null
  const account = accountRows[0] ?? null
  const html = buildWeeklyReportHtml(
    snapshot,
    {
      id: project.id,
      name: project.name,
      client: project.client,
      location: project.location,
    },
    account
      ? {
          id: account.id,
          name: account.name,
          billing_address: account.billing_address,
        }
      : null,
    {
      week_ending: weekEnding,
      generated_at: generatedAt,
      report_id: reportId,
      tenant_name: tenant?.name ?? null,
    }
  )

  // Upload to private `documents` bucket. Failures are non-fatal: we keep
  // the JSONB row and let callers retry via regenerate.
  const ts = generatedAt.getTime()
  const storagePath = `${tenantId}/${projectId}/weekly-report-${ts}.html`
  let documentId: string | null = null
  try {
    const supabase = createSupabaseAdminClient()
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(storagePath, html, {
        contentType: 'text/html; charset=utf-8',
        upsert: true,
      })

    if (uploadErr) {
      console.warn('[weekly-report] storage upload failed:', uploadErr.message)
    } else {
      const fileName = `weekly-report-${weekEnding.toISOString().slice(0, 10)}.html`
      const [doc] = await db
        .insert(documents)
        .values({
          tenant_id: tenantId,
          project_id: projectId,
          uploaded_by: actorId,
          document_type: 'other',
          file_name: fileName,
          storage_path: storagePath,
          mime_type: 'text/html; charset=utf-8',
          size_bytes: Buffer.byteLength(html, 'utf8'),
          description: `Weekly report — week ending ${weekEnding.toISOString().slice(0, 10)}`,
        })
        .returning({ id: documents.id })

      documentId = doc?.id ?? null

      if (documentId) {
        await db
          .update(weeklyReports)
          .set({ report_document_id: documentId })
          .where(eq(weeklyReports.id, reportId))
      }
    }
  } catch (err) {
    console.warn('[weekly-report] artifact persistence failed:', err)
  }

  await writeAuditLog({
    tenantId,
    actorId,
    entityType: 'weekly_report',
    entityId: reportId,
    action: 'create',
    diff: {
      week_ending: weekEnding.toISOString(),
      overall_pct: overallPct,
      tasks_completed: snapshot.tasks_completed.length,
      open_punchlist: snapshot.open_punchlist_count,
      variance_days: variance,
      document_id: documentId,
    },
  })

  return { id: reportId }
}

/**
 * Compute the upcoming Sunday at end-of-day in Manila (UTC+8). Used by the
 * "Generate this week's report" CTA to pick a week boundary that aligns
 * with the local working week.
 */
export function upcomingSundayEndOfDayManila(now: Date = new Date()): Date {
  const MANILA_OFFSET_MIN = 8 * 60
  // Shift to Manila wall-clock, find Sunday 23:59:59.999, shift back to UTC.
  const manila = new Date(now.getTime() + MANILA_OFFSET_MIN * 60_000)
  const dow = manila.getUTCDay() // 0 = Sunday
  const daysUntilSunday = (7 - dow) % 7 // 0 if today is Sunday
  const sundayManila = new Date(manila)
  sundayManila.setUTCDate(manila.getUTCDate() + daysUntilSunday)
  sundayManila.setUTCHours(23, 59, 59, 999)
  return new Date(sundayManila.getTime() - MANILA_OFFSET_MIN * 60_000)
}
