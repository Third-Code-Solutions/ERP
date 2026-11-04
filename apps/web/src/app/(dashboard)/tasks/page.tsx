import type { Metadata } from 'next'
import Link from 'next/link'
import { and, asc, desc, eq, gt, gte, ilike, inArray, lt, lte, or, sql, type SQL } from 'drizzle-orm'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { dailyTasks, projects, users } from '@third-code-erp/database/schema'
import { ERP_ROLES } from '@third-code-erp/shared-types'
import { ROLE_LABELS, TaskRow } from '@/components/tasks/task-row'
import { manilaBoundaries } from '@/lib/operations/cadence-engine'
import { GenerationControl } from './generation-control'
import { NewTaskDialog } from './new-task-dialog'
import qa from '../workspace-qa.module.css'
import styles from './tasks.module.css'

export const metadata: Metadata = { title: 'Tasks' }

type TabKey = 'today' | 'overdue' | 'week' | 'open' | 'completed'
type Scope = 'mine' | 'team'

const TAB_ORDER: TabKey[] = ['today', 'overdue', 'week', 'open', 'completed']
const TAB_LABELS: Record<TabKey, string> = {
  today: 'Due today',
  overdue: 'Overdue',
  week: 'Next 7 days',
  open: 'All open',
  completed: 'Completed',
}
const EMPTY_COPY: Record<TabKey, { title: string; body: string }> = {
  today: { title: 'Nothing due today', body: 'Tasks due today appear here, including the daily cadence for active projects.' },
  overdue: { title: 'No overdue tasks', body: 'Every pending task is still within its due time.' },
  week: { title: 'Nothing due in the next 7 days', body: 'Upcoming tasks appear here once they are assigned.' },
  open: { title: 'No open tasks', body: 'Pending tasks appear here until they are completed.' },
  completed: { title: 'No completed tasks yet', body: 'Completed tasks and their notes appear here.' },
}

const ROW_LIMIT = 200
const SEARCH_MAX = 100
const DUE_HOUR_DEFAULT = 17
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const MANILA_OFFSET_MS = 8 * HOUR_MS
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TASK_ASSIGNEE_ROLES = ERP_ROLES.filter((role) => can(role, 'sd.daily_tasks'))
const CLOSED_PROJECT_STATUSES = new Set(['completed', 'cancelled'])

type SearchParamValue = string | string[] | undefined
interface TasksPageProps {
  searchParams?: Promise<Record<string, SearchParamValue>>
}

function pickFirst(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parseTab(value: SearchParamValue): TabKey {
  const v = pickFirst(value)
  return (TAB_ORDER as readonly string[]).includes(v ?? '') ? (v as TabKey) : 'today'
}

interface Filters {
  scope: Scope
  project?: string
  q: string
}

function tasksHref(tab: TabKey, filters: Filters): string {
  const params = new URLSearchParams()
  if (tab !== 'today') params.set('tab', tab)
  if (filters.scope === 'team') params.set('scope', 'team')
  if (filters.project) params.set('project', filters.project)
  if (filters.q) params.set('q', filters.q)
  const query = params.toString()
  return query ? `/tasks?${query}` : '/tasks'
}

/** Next 5:00 PM Manila as a datetime-local value. */
function defaultDueAt(now: Date): string {
  let due = manilaBoundaries.atHour(now, DUE_HOUR_DEFAULT).getTime()
  if (due <= now.getTime()) due += DAY_MS
  return new Date(due + MANILA_OFFSET_MS).toISOString().slice(0, 16)
}

function countWhere(condition: SQL | undefined) {
  return sql<number>`cast(count(*) filter (where ${condition}) as int)`
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) {
    return (
      <div className="page-header">
        <h1 className="page-title">Tasks</h1>
        <p className="page-subtitle">You must be signed in to view tasks.</p>
      </div>
    )
  }

  const raw = searchParams ? await searchParams : {}
  const tab = parseTab(raw.tab)
  const isManager = profile.role === 'owner' || profile.role === 'admin'
  const canCompleteTasks = can(profile.role, 'sd.daily_tasks')
  const projectParam = pickFirst(raw.project)
  const filters: Filters = {
    scope: isManager && pickFirst(raw.scope) === 'team' ? 'team' : 'mine',
    project: projectParam && UUID_PATTERN.test(projectParam) ? projectParam : undefined,
    q: (pickFirst(raw.q) ?? '').trim().slice(0, SEARCH_MAX),
  }
  const hasFilters = Boolean(filters.project || filters.q)

  const now = new Date()
  const todayStart = manilaBoundaries.startOfDay(now)
  const todayEnd = manilaBoundaries.endOfDay(now)
  const weekEnd = new Date(todayEnd.getTime() + 7 * DAY_MS)

  const scoped: SQL[] = [eq(dailyTasks.tenant_id, profile.tenantId)]
  if (filters.scope === 'mine') scoped.push(eq(dailyTasks.assignee_id, profile.user.id))
  if (filters.project) scoped.push(eq(dailyTasks.project_id, filters.project))
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`
    const match = or(ilike(dailyTasks.title, pattern), ilike(dailyTasks.description, pattern))
    if (match) scoped.push(match)
  }

  const pending = eq(dailyTasks.status, 'pending')
  const tabWhere: Record<TabKey, SQL | undefined> = {
    today: and(pending, gte(dailyTasks.due_date, todayStart), lte(dailyTasks.due_date, todayEnd)),
    overdue: and(pending, lt(dailyTasks.due_date, now)),
    week: and(pending, gt(dailyTasks.due_date, todayEnd), lte(dailyTasks.due_date, weekEnd)),
    open: pending,
    completed: eq(dailyTasks.status, 'done'),
  }

  const [countRows, rows, projectOptions, assigneeRows] = await Promise.all([
    db
      .select({
        today: countWhere(tabWhere.today),
        overdue: countWhere(tabWhere.overdue),
        week: countWhere(tabWhere.week),
        open: countWhere(tabWhere.open),
        completed: countWhere(tabWhere.completed),
      })
      .from(dailyTasks)
      .where(and(...scoped)),
    db
      .select({
        id: dailyTasks.id,
        project_id: dailyTasks.project_id,
        project_name: projects.name,
        assignee_id: dailyTasks.assignee_id,
        assignee_name: users.full_name,
        title: dailyTasks.title,
        description: dailyTasks.description,
        role: dailyTasks.role,
        due_date: dailyTasks.due_date,
        status: dailyTasks.status,
        completion_notes: dailyTasks.completion_notes,
        completed_at: dailyTasks.completed_at,
      })
      .from(dailyTasks)
      .innerJoin(projects, and(eq(projects.id, dailyTasks.project_id), eq(projects.tenant_id, dailyTasks.tenant_id)))
      .leftJoin(users, and(eq(users.id, dailyTasks.assignee_id), eq(users.tenant_id, dailyTasks.tenant_id)))
      .where(and(...scoped, tabWhere[tab]))
      .orderBy(tab === 'completed' ? desc(dailyTasks.completed_at) : asc(dailyTasks.due_date))
      .limit(ROW_LIMIT),
    db
      .select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .where(eq(projects.tenant_id, profile.tenantId))
      .orderBy(asc(projects.name))
      .limit(500),
    canCompleteTasks
      ? db
          .select({ id: users.id, fullName: users.full_name, role: users.role })
          .from(users)
          .where(
            and(
              eq(users.tenant_id, profile.tenantId),
              eq(users.account_status, 'active'),
              inArray(users.role, TASK_ASSIGNEE_ROLES),
            ),
          )
          .orderBy(asc(users.full_name))
      : Promise.resolve([]),
  ])

  const counts: Record<TabKey, number> = {
    today: countRows[0]?.today ?? 0,
    overdue: countRows[0]?.overdue ?? 0,
    week: countRows[0]?.week ?? 0,
    open: countRows[0]?.open ?? 0,
    completed: countRows[0]?.completed ?? 0,
  }
  const showAssignee = filters.scope === 'team'
  const truncated = counts[tab] > rows.length && rows.length === ROW_LIMIT
  const openProjects = projectOptions.filter((p) => !CLOSED_PROJECT_STATUSES.has(p.status))
  const assignees = assigneeRows.map((a) => ({
    id: a.id,
    fullName: a.fullName,
    roleLabel: ROLE_LABELS[a.role] ?? a.role,
  }))
  const subtitle =
    filters.scope === 'team'
      ? 'Every task in this workspace, across active projects. Due times follow Manila time.'
      : `Work assigned to ${profile.fullName || profile.email}. Due times follow Manila time.`
  const empty = hasFilters
    ? { title: 'No tasks match these filters', body: 'Try another project or search term, or clear the filters.' }
    : EMPTY_COPY[tab]

  return (
    <div>
      <div className="page-header">
        <div className="page-toolbar">
          <div>
            <p className="page-eyebrow">Construction</p>
            <h1 className="page-title">Tasks</h1>
            <p className="page-subtitle">{subtitle}</p>
          </div>
          {(isManager || canCompleteTasks) && (
            <div className={styles.headerActions}>
              {isManager && <GenerationControl />}
              {canCompleteTasks && (
                <NewTaskDialog
                  projects={openProjects}
                  assignees={assignees}
                  defaultDueAt={defaultDueAt(now)}
                  defaultAssigneeId={profile.user.id}
                  defaultProjectId={filters.project}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <nav aria-label="Task views" className={styles.views}>
        {TAB_ORDER.map((key) => (
          <Link
            key={key}
            href={tasksHref(key, filters)}
            className={styles.view}
            aria-current={key === tab ? 'page' : undefined}
            data-tone={key === 'overdue' && counts.overdue > 0 ? 'danger' : undefined}
          >
            <span className={styles.viewCount}>{counts[key].toLocaleString('en-PH')}</span>
            <span className={styles.viewLabel}>{TAB_LABELS[key]}</span>
          </Link>
        ))}
      </nav>

      <section className="card" aria-labelledby="task-list-title">
        <div className={`card-header ${styles.listHeader}`}>
          <h2 id="task-list-title" className="card-title">
            {TAB_LABELS[tab]} · {counts[tab].toLocaleString('en-PH')} task{counts[tab] === 1 ? '' : 's'}
          </h2>
          <form method="get" action="/tasks" role="search" aria-label="Filter tasks" className={styles.filters}>
            {tab !== 'today' && <input type="hidden" name="tab" value={tab} />}
            {isManager && (
              <select
                name="scope"
                defaultValue={filters.scope}
                aria-label="Whose tasks"
                className={`form-input ${styles.filterField}`}
              >
                <option value="mine">My tasks</option>
                <option value="team">Team tasks</option>
              </select>
            )}
            <select
              name="project"
              defaultValue={filters.project ?? ''}
              aria-label="Project"
              className={`form-input ${styles.filterField}`}
            >
              <option value="">All projects</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <input
              type="search"
              name="q"
              defaultValue={filters.q}
              maxLength={SEARCH_MAX}
              placeholder="Search tasks"
              aria-label="Search tasks"
              className={`form-input ${styles.searchField}`}
            />
            <button type="submit" className="button-secondary">Apply</button>
            {hasFilters && (
              <Link href={tasksHref(tab, { scope: filters.scope, q: '' })} className={styles.clearLink}>
                Clear
              </Link>
            )}
          </form>
        </div>

        {rows.length === 0 ? (
          <div className={qa.empty}>
            <h2>{empty.title}</h2>
            <p>{empty.body}</p>
            <Link href="/projects" className="button-secondary">View projects</Link>
          </div>
        ) : (
          <div className={qa.table}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Project</th>
                  {showAssignee && <th>Assignee</th>}
                  <th>Due</th>
                  <th>Status</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    now={now.getTime()}
                    todayEnd={todayEnd.getTime()}
                    showAssignee={showAssignee}
                    readOnly={!canCompleteTasks}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {truncated && (
          <p className={styles.footnote}>
            Showing the first {ROW_LIMIT} of {counts[tab].toLocaleString('en-PH')} tasks. Filter by project or search to narrow the list.
          </p>
        )}
      </section>
    </div>
  )
}
