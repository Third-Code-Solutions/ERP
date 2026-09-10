'use server'

/**
 * M5 US-Con-003 — Master schedule import + weekly progress updates.
 *
 * Two server actions:
 *   - importMasterSchedule(): parses a CSV of L1 tasks, replaces any
 *     existing master schedule for the project, audit-logs the action.
 *   - submitWeeklyProgress(): inserts a progress_updates row, audit-logs,
 *     and fires milestone notifications when overall_pct crosses
 *     25/50/75/100% thresholds for the first time.
 *
 * CSV format (one row per L1 task):
 *   name,start_date,finish_date,predecessor_index,planned_pct_curve
 * where planned_pct_curve is a JSON-array string of weekly cumulative %.
 */

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { can, getUserProfile, type AppRole } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  masterSchedules,
  progressUpdates,
  projects,
} from '@third-code-erp/database/schema'
import { writeAuditLog, writeAuditLogInTransaction } from '@/lib/audit'
import { notifyRoles } from '@/lib/operations/notifications'
import {
  createProjectWeeklyProgressThroughCoreApi,
  lockProjectWeeklyProgressThroughCoreApi,
  projectWeeklyProgressWritesUseCoreApi,
} from '@/lib/erp-core-client'

import {
  formatImportRejections,
  parseMasterScheduleCsv,
  type MasterScheduleImportPreview,
} from './master-schedule-parser'
export type {
  MasterScheduleImportPreview,
  MasterScheduleImportRejection,
  MasterScheduleTask,
} from './master-schedule-parser'

export interface MasterScheduleImportResult {
  error?: string
  taskCount?: number
  preview?: MasterScheduleImportPreview
}

export interface PercentByCategory {
  civil_pct: number
  electrical_pct: number
  mep_pct: number
  finishes_pct: number
  overall_pct: number
}

const MILESTONES = [25, 50, 75, 100] as const

async function getTenantContext(): Promise<
  | { tenantId: string; userId: string; role: AppRole }
  | { error: string }
> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  return { tenantId: profile.tenantId, userId: profile.user.id, role: profile.role }
}

async function assertProjectInTenant(projectId: string, tenantId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId), isNull(projects.deleted_at)))
    .limit(1)
  return Boolean(row)
}


async function getScheduleImportContext(projectId: string): Promise<
  | { tenantId: string; userId: string; role: AppRole }
  | { error: string }
> {
  const ctx = await getTenantContext()
  if ('error' in ctx) return { error: ctx.error }
  if (!can(ctx.role, 'project.schedule.manage')) {
    return { error: 'Forbidden: your role cannot manage master schedules.' }
  }

  if (!(await assertProjectInTenant(projectId, ctx.tenantId))) {
    return { error: 'Project not found' }
  }
  return ctx
}

export async function previewMasterSchedule(
  projectId: string,
  csvText: string,
): Promise<{ error?: string; preview?: MasterScheduleImportPreview }> {
  const ctx = await getScheduleImportContext(projectId)
  if ('error' in ctx) return { error: ctx.error }
  if (!csvText.trim()) return { error: 'CSV is empty' }
  const preview = parseMasterScheduleCsv(csvText)
  return { preview }
}

export async function importMasterSchedule(
  projectId: string,
  csvText: string,
): Promise<MasterScheduleImportResult> {
  const ctx = await getScheduleImportContext(projectId)
  if ('error' in ctx) return { error: ctx.error }

  if (!csvText.trim()) return { error: 'CSV is empty' }

  const preview = parseMasterScheduleCsv(csvText)
  if (preview.rejectedRows.length > 0) {
    return { error: formatImportRejections(preview.rejectedRows), preview }
  }
  if (preview.tasks.length === 0) return { error: 'No valid task rows found', preview }

  try {
    await db.transaction(async (tx) => {
      // Lock project row so two replacement imports cannot interleave delete/insert.
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.tenant_id, ctx.tenantId), isNull(projects.deleted_at)))
        .limit(1)
        .for('update')
      if (!project) throw new Error('Project not found')

      await tx
        .delete(masterSchedules)
        .where(and(eq(masterSchedules.project_id, projectId), eq(masterSchedules.tenant_id, ctx.tenantId)))

      const [inserted] = await tx
        .insert(masterSchedules)
        .values({
          tenant_id: ctx.tenantId,
          project_id: projectId,
          tasks: preview.tasks,
          imported_by: ctx.userId,
        })
        .returning({ id: masterSchedules.id })
      if (!inserted) throw new Error('Schedule replacement was not created')

      await writeAuditLogInTransaction(tx, {
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        entityType: 'master_schedule',
        entityId: inserted.id,
        action: 'create',
        diff: { task_count: preview.tasks.length, replaced: true },
      })
    })
  } catch {
    return { error: 'Schedule replacement failed. Existing schedule was preserved.', preview }
  }

  revalidatePath(`/projects/${projectId}/progress`)
  return { taskCount: preview.tasks.length, preview }
}

/** Find the highest milestone (25/50/75/100) that overall_pct has crossed. */
function highestMilestoneCrossed(overallPct: number): number | null {
  let best: number | null = null
  for (const m of MILESTONES) {
    if (overallPct >= m) best = m
  }
  return best
}

export async function submitWeeklyProgress(
  projectId: string,
  weekEnding: string,
  percentByCategory: PercentByCategory,
  notes = '',
): Promise<{ error?: string; id?: string }> {
  const ctx = await getTenantContext()
  if ('error' in ctx) return { error: ctx.error }
  if (!can(ctx.role, 'project.weekly_progress.submit')) {
    return { error: 'Forbidden: your role cannot submit weekly progress.' }
  }

  if (!(await assertProjectInTenant(projectId, ctx.tenantId))) {
    return { error: 'Project not found' }
  }

  if (projectWeeklyProgressWritesUseCoreApi(ctx.tenantId)) {
    const result = await createProjectWeeklyProgressThroughCoreApi({
      projectId,
      clientRequestId: randomUUID(),
      weekEnding,
      percentByCategory,
      notes,
    })
    if (!result.ok || !result.data) return { error: result.error ?? 'Weekly progress was not captured.' }
    revalidatePath(`/projects/${projectId}/progress`)
    return { id: result.data.row.progressUpdateId }
  }

  const week = new Date(weekEnding)
  if (Number.isNaN(week.getTime())) return { error: 'Invalid week_ending' }

  const clamp = (v: number) => Math.max(0, Math.min(100, Number(v) || 0))
  const cleaned: PercentByCategory = {
    civil_pct: clamp(percentByCategory.civil_pct),
    electrical_pct: clamp(percentByCategory.electrical_pct),
    mep_pct: clamp(percentByCategory.mep_pct),
    finishes_pct: clamp(percentByCategory.finishes_pct),
    overall_pct: clamp(percentByCategory.overall_pct),
  }

  // Compare to the prior update to detect first-time milestone crossings.
  const [prior] = await db
    .select({ percent_by_category: progressUpdates.percent_by_category })
    .from(progressUpdates)
    .where(
      and(
        eq(progressUpdates.project_id, projectId),
        eq(progressUpdates.tenant_id, ctx.tenantId),
      ),
    )
    .orderBy(desc(progressUpdates.week_ending))
    .limit(1)

  const priorOverall =
    (prior?.percent_by_category as { overall_pct?: number } | null)?.overall_pct ?? 0

  const [inserted] = await db
    .insert(progressUpdates)
    .values({
      tenant_id: ctx.tenantId,
      project_id: projectId,
      week_ending: week,
      percent_by_category: cleaned,
      submitted_by: ctx.userId,
    })
    .returning({ id: progressUpdates.id })

  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    entityType: 'progress_update',
    entityId: inserted!.id,
    action: 'create',
    diff: {
      week_ending: week.toISOString(),
      percent_by_category: cleaned,
    },
  })

  // Milestone notification — fire once per crossing.
  const priorMilestone = highestMilestoneCrossed(priorOverall)
  const newMilestone = highestMilestoneCrossed(cleaned.overall_pct)
  if (newMilestone !== null && newMilestone !== priorMilestone) {
    const [project] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenant_id, ctx.tenantId)))
      .limit(1)

    await notifyRoles({
      tenantId: ctx.tenantId,
      recipientRoles: ['sd_pm_pe', 'commercial'],
      subject: `Milestone reached — ${newMilestone}%`,
      body: `${project?.name ?? 'Project'} crossed ${newMilestone}% overall progress (week ending ${week.toISOString().slice(0, 10)}).`,
      linkUrl: `/projects/${projectId}/progress`,
      payload: { milestone_pct: newMilestone, project_id: projectId },
    })
  }

  revalidatePath(`/projects/${projectId}/progress`)
  return { id: inserted!.id }
}

/** Lock a Core weekly period into its immutable WAR snapshot after cut-off. */
export async function lockWeeklyProgress(
  projectId: string,
  periodId: string,
  expectedVersion: number,
  lockReason = '',
): Promise<{ error?: string; id?: string }> {
  const ctx = await getTenantContext()
  if ('error' in ctx) return { error: ctx.error }
  if (!can(ctx.role, 'precon.manage_checklist')) {
    return { error: 'Forbidden: your role cannot lock weekly WAR periods.' }
  }
  if (!(await assertProjectInTenant(projectId, ctx.tenantId))) {
    return { error: 'Project not found' }
  }
  if (!projectWeeklyProgressWritesUseCoreApi(ctx.tenantId)) {
    return { error: 'WAR locking is available only after the Core weekly-progress canary is enabled.' }
  }
  const result = await lockProjectWeeklyProgressThroughCoreApi(projectId, periodId, {
    expectedVersion,
    lockReason,
  })
  if (!result.ok || !result.data) return { error: result.error ?? 'WAR was not locked.' }
  revalidatePath(`/projects/${projectId}/progress`)
  return { id: result.data.row.id }
}

/** Helper used by the page to load the latest schedule + ordered updates. */
export async function loadProgressContext(projectId: string, tenantId: string) {
  const [schedule] = await db
    .select()
    .from(masterSchedules)
    .where(
      and(
        eq(masterSchedules.project_id, projectId),
        eq(masterSchedules.tenant_id, tenantId),
      ),
    )
    .orderBy(desc(masterSchedules.imported_at))
    .limit(1)

  const updates = await db
    .select()
    .from(progressUpdates)
    .where(
      and(
        eq(progressUpdates.project_id, projectId),
        eq(progressUpdates.tenant_id, tenantId),
      ),
    )
    .orderBy(asc(progressUpdates.week_ending))

  return { schedule: schedule ?? null, updates }
}
