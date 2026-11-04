/**
 * Cadence engine — daily task generator.
 *
 * REFACTOR.md M5 US-Con-001. For each active project in a tenant we generate
 * a fixed set of role-keyed daily tasks (e.g. "Daily site walk" for sd_pm_pe)
 * and assign them to every user holding that role.
 *
 * Idempotent: re-running for the same date is a no-op because we skip rows
 * that already exist for (assignee, project, title, due-date::date). Runs for
 * one tenant-day are serialized by a transaction-scoped advisory lock and
 * commit all-or-nothing. Only active accounts receive tasks.
 *
 * Configuration is hardcoded here for v1; a future iteration will move
 * templates into the database so admins can tune per-tenant.
 */

import { db } from '@third-code-erp/database'
import { dailyTasks, projects, users } from '@third-code-erp/database/schema'
import type { AppRole } from '@third-code-erp/auth'
import { and, eq, gte, isNotNull, lte, sql } from 'drizzle-orm'

const INSERT_CHUNK_SIZE = 250

/** Project statuses that no longer accept new tasks. */
export const CLOSED_PROJECT_STATUSES: ReadonlySet<string> = new Set(['completed', 'cancelled'])

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
const MANILA_OFFSET_MS = MANILA_OFFSET_HOURS * 3600 * 1000
const DAY_MS = 86_400_000
const DATETIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** UTC fields encode the Manila calendar date, for date-only generation inputs. */
export function manilaCalendarDate(instant: Date): Date {
  const local = new Date(instant.getTime() + MANILA_OFFSET_MS)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))
}

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

  // Group active users by role once — avoids N*M roundtrips when many projects exist.
  const allUsers = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.tenant_id, tenantId), eq(users.account_status, 'active')))

  const usersByRole = new Map<string, string[]>()
  for (const u of allUsers) {
    const bucket = usersByRole.get(u.role) ?? []
    bucket.push(u.id)
    usersByRole.set(u.role, bucket)
  }

  const dayStart = manilaDayAt(date, 0)
  const dayEnd = manilaEndOfDay(date)
  const dayKey = date.toISOString().slice(0, 10)

  return db.transaction(async (tx) => {
    // Overlapping runs (cron, admins, tabs) for one tenant-day queue here, so the
    // existing-rows snapshot below cannot go stale before these inserts commit.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('cadence:' || ${tenantId}::text || ':' || ${dayKey}::text, 0))`,
    )

    // Idempotency: one read of the day's cadence rows, keyed by (project, assignee, title).
    // Manual tasks (role null) never stand in for a cadence row.
    const existingRows = await tx
      .select({
        project_id: dailyTasks.project_id,
        assignee_id: dailyTasks.assignee_id,
        title: dailyTasks.title,
      })
      .from(dailyTasks)
      .where(
        and(
          eq(dailyTasks.tenant_id, tenantId),
          isNotNull(dailyTasks.role),
          gte(dailyTasks.due_date, dayStart),
          lte(dailyTasks.due_date, dayEnd),
        ),
      )
    const taskKey = (projectId: string, assigneeId: string | null, title: string) =>
      `${projectId}\u0000${assigneeId ?? ''}\u0000${title}`
    const seen = new Set(existingRows.map((r) => taskKey(r.project_id, r.assignee_id, r.title)))

    const toInsert: (typeof dailyTasks.$inferInsert)[] = []
    let skipped = 0

    for (const project of activeProjects) {
      for (const template of templates) {
        const assignees = usersByRole.get(template.role) ?? []
        for (const task of template.tasks) {
          const due = task.hour !== undefined ? manilaDayAt(date, task.hour) : dayEnd
          for (const assigneeId of assignees) {
            const key = taskKey(project.id, assigneeId, task.title)
            if (seen.has(key)) {
              skipped += 1
              continue
            }
            seen.add(key)
            toInsert.push({
              tenant_id: tenantId,
              project_id: project.id,
              assignee_id: assigneeId,
              title: task.title,
              description: task.description,
              role: template.role,
              due_date: due,
              status: 'pending',
            })
          }
        }
      }
    }

    // Chunked: stays far below the bind-parameter limit. One transaction keeps the
    // run all-or-nothing, so a failed chunk leaves no partial day behind.
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK_SIZE) {
      await tx.insert(dailyTasks).values(toInsert.slice(i, i + INSERT_CHUNK_SIZE))
    }

    return { created: toInsert.length, skipped, projectsConsidered: activeProjects.length }
  })
}

// Read-side callers supply instants; generation above accepts a calendar date.
export const manilaBoundaries = {
  startOfDay: (date: Date) => manilaDayAt(manilaCalendarDate(date), 0),
  endOfDay: (date: Date) => manilaEndOfDay(manilaCalendarDate(date)),
  atHour: (date: Date, hour: number) => manilaDayAt(manilaCalendarDate(date), hour),
}

/** Manila wall-clock time of an instant as a datetime-local value (YYYY-MM-DDTHH:MM). */
export function toManilaDateTimeLocal(instant: Date): string {
  return new Date(instant.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 16)
}

/**
 * Parse a datetime-local value as Manila wall-clock time. Returns null for
 * malformed or impossible values (Feb 30, 24:00, minute 60): the parsed instant
 * must format back to the exact input. Date.UTC maps years 0-99 to 1900-1999,
 * so the same round trip rejects those years too.
 */
export function parseManilaDateTimeLocal(value: string): Date | null {
  const match = DATETIME_LOCAL_PATTERN.exec(value)
  if (!match) return null
  const instant = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]) - MANILA_OFFSET_HOURS,
      Number(match[5]),
    ),
  )
  return toManilaDateTimeLocal(instant) === value ? instant : null
}

/** Manila calendar days from `b` to `a` (positive when `a` is on a later day). */
export function manilaDaysBetween(a: Date, b: Date): number {
  return (manilaCalendarDate(a).getTime() - manilaCalendarDate(b).getTime()) / DAY_MS
}
