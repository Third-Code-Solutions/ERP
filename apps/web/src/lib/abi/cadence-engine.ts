/**
 * Cadence engine — daily task generator.
 *
 * REFACTOR.md M5 US-Con-001. For each active project in a tenant we generate
 * a fixed set of role-keyed daily tasks (e.g. "Daily site walk" for sd_pm_pe)
 * and assign them to every user holding that role.
 *
 * Idempotent: re-running for the same date is a no-op because we skip rows
 * that already exist for (assignee, project, title, due-date::date).
 *
 * Configuration is hardcoded here for v1; a future iteration will move
 * templates into the database so admins can tune per-tenant.
 */

import { db } from '@buildops/database'
import { dailyTasks, projects, users } from '@buildops/database/schema'
import type { AppRole } from '@buildops/auth'
import { and, eq, gte, lte, sql } from 'drizzle-orm'

export interface CadenceTask {
  title: string
  description?: string
  /** Hour-of-day in Manila local time the task is nominally due at. */
  hour?: number
}

export interface CadenceTemplate {
  role: AppRole
  tasks: CadenceTask[]
}

// Default templates per role. Order is significant for predictable output.
export const DEFAULT_CADENCE_TEMPLATES: CadenceTemplate[] = [
  {
    role: 'sd_pm_pe',
    tasks: [
      { title: 'Daily site walk', description: 'Walk the site, log conditions, flag hazards.', hour: 8 },
      { title: 'Update progress board', description: 'Reflect today\'s actual vs scheduled progress.', hour: 17 },
      { title: 'Verify subcon attendance', description: 'Confirm subcontractor headcount against plan.', hour: 9 },
    ],
  },
  {
    role: 'safety',
    tasks: [
      { title: 'Toolbox meeting log', description: 'Run pre-shift toolbox meeting and log attendees.', hour: 7 },
      { title: 'PPE compliance check', description: 'Random PPE compliance check around the site.', hour: 10 },
    ],
  },
  {
    role: 'commercial',
    tasks: [
      { title: 'Variation log review', description: 'Review open variation orders for blockers.', hour: 11 },
    ],
  },
  {
    role: 'procurement',
    tasks: [
      { title: 'Delivery tracking sweep', description: 'Confirm scheduled deliveries against PO promises.', hour: 14 },
    ],
  },
]

// Manila is UTC+8 with no DST.
const MANILA_OFFSET_HOURS = 8

/**
 * Convert a "local Manila day" into the UTC instant for the given hour.
 * The `date` arg is treated as a Manila calendar date (year/month/day),
 * its UTC components are ignored.
 */
function manilaDayAt(date: Date, hour: number): Date {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth()
  const d = date.getUTCDate()
  // Manila hour `h` happens at UTC hour `h - 8`. Date.UTC handles
  // negative hours by rolling into the previous day, which is what we want.
  return new Date(Date.UTC(y, m, d, hour - MANILA_OFFSET_HOURS, 0, 0, 0))
}

/** End-of-day Manila for the given date (Manila 23:59:59.999 → UTC). */
function manilaEndOfDay(date: Date): Date {
  return new Date(manilaDayAt(date, 24).getTime() - 1)
}

interface GenerateResult {
  /** Tasks newly inserted on this run. */
  created: number
  /** Tasks skipped because an identical row already existed. */
  skipped: number
  /** Active projects considered. */
  projectsConsidered: number
}

/**
 * Generate daily cadence tasks for every active project in a tenant.
 *
 * @param tenantId scope
 * @param date Manila calendar date the tasks are due on. Time-of-day is derived
 *             from each template's `hour` setting; absent that, end-of-day Manila.
 * @param templates allow overriding the default config (mainly for tests).
 */
export async function generateTasksForDate(
  tenantId: string,
  date: Date,
  templates: CadenceTemplate[] = DEFAULT_CADENCE_TEMPLATES,
): Promise<GenerateResult> {
  if (!tenantId) throw new Error('tenantId required')

  const activeProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.tenant_id, tenantId), eq(projects.status, 'active')))

  if (activeProjects.length === 0) {
    return { created: 0, skipped: 0, projectsConsidered: 0 }
  }

  // Group users by role once — avoids N*M roundtrips when many projects exist.
  const allUsers = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.tenant_id, tenantId))

  const usersByRole = new Map<string, string[]>()
  for (const u of allUsers) {
    const bucket = usersByRole.get(u.role) ?? []
    bucket.push(u.id)
    usersByRole.set(u.role, bucket)
  }

  const dayStart = manilaDayAt(date, 0)
  const dayEnd = manilaEndOfDay(date)

  let created = 0
  let skipped = 0

  for (const project of activeProjects) {
    for (const template of templates) {
      const assignees = usersByRole.get(template.role) ?? []
      if (assignees.length === 0) continue

      for (const task of template.tasks) {
        const due = task.hour !== undefined ? manilaDayAt(date, task.hour) : dayEnd

        for (const assigneeId of assignees) {
          // Idempotency: look for an existing row for this (assignee, project, title)
          // landing inside the Manila calendar day.
          const existing = await db
            .select({ id: dailyTasks.id })
            .from(dailyTasks)
            .where(
              and(
                eq(dailyTasks.tenant_id, tenantId),
                eq(dailyTasks.project_id, project.id),
                eq(dailyTasks.assignee_id, assigneeId),
                eq(dailyTasks.title, task.title),
                gte(dailyTasks.due_date, dayStart),
                lte(dailyTasks.due_date, dayEnd),
              ),
            )
            .limit(1)

          if (existing.length > 0) {
            skipped += 1
            continue
          }

          await db.insert(dailyTasks).values({
            tenant_id: tenantId,
            project_id: project.id,
            assignee_id: assigneeId,
            title: task.title,
            description: task.description,
            role: template.role,
            due_date: due,
            status: 'pending',
          })
          created += 1
        }
      }
    }
  }

  return { created, skipped, projectsConsidered: activeProjects.length }
}

// Re-exported so callers can compute Manila day boundaries identically.
export const manilaBoundaries = {
  startOfDay: (date: Date) => manilaDayAt(date, 0),
  endOfDay: manilaEndOfDay,
  atHour: manilaDayAt,
}

// Suppress unused warning — `sql` is reserved for a future ON CONFLICT path
// once we add the partial unique index described in REFACTOR.md.
void sql
