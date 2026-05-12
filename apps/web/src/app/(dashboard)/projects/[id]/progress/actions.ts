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

import { revalidatePath } from 'next/cache'
import { and, asc, desc, eq } from 'drizzle-orm'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import {
  masterSchedules,
  progressUpdates,
  projects,
  users,
} from '@buildops/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { notifyRoles } from '@/lib/abi/notifications'

export interface MasterScheduleTask {
  name: string
  start_date: string
  finish_date: string
  predecessor_index: number | null
  planned_pct_curve: number[]
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
  | { tenantId: string; userId: string }
  | { error: string }
> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }
  const [row] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))
  if (!row?.tenant_id) return { error: 'No tenant' }
  return { tenantId: row.tenant_id, userId: user.id }
}

async function assertProjectInTenant(projectId: string, tenantId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId)))
    .limit(1)
  return Boolean(row)
}

/**
 * Minimal CSV parser. Handles quoted cells (used for JSON-array of weekly %)
 * and rejects malformed rows. Avoids pulling in a CSV dep just for L1
 * schedule imports.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      cur.push(cell)
      cell = ''
      continue
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      cur.push(cell)
      if (cur.some((c) => c.trim() !== '')) rows.push(cur)
      cur = []
      cell = ''
      continue
    }
    cell += ch
  }
  if (cell !== '' || cur.length > 0) {
    cur.push(cell)
    if (cur.some((c) => c.trim() !== '')) rows.push(cur)
  }
  return rows
}

function parsePctCurve(raw: string): number[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((v) => (typeof v === 'number' ? v : Number(v)))
      .filter((v) => Number.isFinite(v))
  } catch {
    // Fallback: pipe-separated.
    return trimmed
      .split('|')
      .map((s) => Number(s.trim()))
      .filter((v) => Number.isFinite(v))
  }
}

export async function importMasterSchedule(
  projectId: string,
  csvText: string
): Promise<{ error?: string; taskCount?: number }> {
  const ctx = await getTenantContext()
  if ('error' in ctx) return { error: ctx.error }

  if (!(await assertProjectInTenant(projectId, ctx.tenantId))) {
    return { error: 'Project not found' }
  }

  if (!csvText.trim()) return { error: 'CSV is empty' }

  const rows = parseCsv(csvText)
  if (rows.length === 0) return { error: 'No rows parsed' }

  // Drop header row if present (first cell looks like "name").
  const header = rows[0]
  const start = header && header[0]?.trim().toLowerCase() === 'name' ? 1 : 0

  const tasks: MasterScheduleTask[] = []
  for (let i = start; i < rows.length; i++) {
    const cols = rows[i]
    if (!cols || cols.length < 5) continue
    const name = cols[0]?.trim()
    const startDate = cols[1]?.trim()
    const finishDate = cols[2]?.trim()
    const predRaw = cols[3]?.trim() ?? ''
    const curveRaw = cols[4] ?? ''

    if (!name || !startDate || !finishDate) continue

    const predecessor_index = predRaw === '' || predRaw.toLowerCase() === 'null'
      ? null
      : Number.isFinite(Number(predRaw))
        ? Number(predRaw)
        : null

    tasks.push({
      name,
      start_date: startDate,
      finish_date: finishDate,
      predecessor_index,
      planned_pct_curve: parsePctCurve(curveRaw),
    })
  }

  if (tasks.length === 0) return { error: 'No valid task rows found' }

  // Replace any existing schedule. There's no unique constraint, so we
  // delete + insert atomically inside a single transaction would be ideal —
  // but the existing codebase uses plain awaits, so we mirror that style.
  await db
    .delete(masterSchedules)
    .where(
      and(
        eq(masterSchedules.project_id, projectId),
        eq(masterSchedules.tenant_id, ctx.tenantId),
      ),
    )

  const [inserted] = await db
    .insert(masterSchedules)
    .values({
      tenant_id: ctx.tenantId,
      project_id: projectId,
      tasks,
      imported_by: ctx.userId,
    })
    .returning({ id: masterSchedules.id })

  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    entityType: 'master_schedule',
    entityId: inserted!.id,
    action: 'create',
    diff: { task_count: tasks.length },
  })

  revalidatePath(`/projects/${projectId}/progress`)
  return { taskCount: tasks.length }
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
): Promise<{ error?: string; id?: string }> {
  const ctx = await getTenantContext()
  if ('error' in ctx) return { error: ctx.error }

  if (!(await assertProjectInTenant(projectId, ctx.tenantId))) {
    return { error: 'Project not found' }
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
      .where(eq(projects.id, projectId))
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
