import type { Metadata } from 'next'
import Link from 'next/link'
import { and, asc, desc, eq, gt, gte, lt, lte } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { dailyTasks, projects } from '@third-code-erp/database/schema'
import { TaskRow, type TaskRowData } from '@/components/tasks/task-row'
import { manilaBoundaries } from '@/lib/operations/cadence-engine'

export const metadata: Metadata = { title: 'My Tasks' }

type TabKey = 'today' | 'overdue' | 'week' | 'completed'

const TAB_ORDER: TabKey[] = ['today', 'overdue', 'week', 'completed']
const TAB_LABELS: Record<TabKey, string> = {
  today: 'Today',
  overdue: 'Overdue',
  week: 'This week',
  completed: 'Completed',
}

type SearchParamValue = string | string[] | undefined
interface TasksPageProps {
  searchParams?: Promise<Record<string, SearchParamValue>>
}

function pickFirst(value: SearchParamValue): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function parseTab(value: SearchParamValue): TabKey {
  const v = pickFirst(value)
  return (TAB_ORDER as readonly string[]).includes(v ?? '') ? (v as TabKey) : 'today'
}

interface TaskJoinedRow {
  id: string
  project_id: string
  project_name: string
  title: string
  description: string | null
  role: string | null
  due_date: Date
  status: 'pending' | 'done' | 'skipped'
  completion_notes: string | null
  completed_at: Date | null
}

const TASK_COLUMNS = {
  id: dailyTasks.id,
  project_id: dailyTasks.project_id,
  project_name: projects.name,
  title: dailyTasks.title,
  description: dailyTasks.description,
  role: dailyTasks.role,
  due_date: dailyTasks.due_date,
  status: dailyTasks.status,
  completion_notes: dailyTasks.completion_notes,
  completed_at: dailyTasks.completed_at,
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) {
    return (
      <div className="page-header">
        <h1 className="page-title">My Tasks</h1>
        <p className="page-subtitle">You must be signed in to view tasks.</p>
      </div>
    )
  }

  const rawSearch = searchParams ? await searchParams : {}
  const tab = parseTab(rawSearch.tab)

  const now = new Date()
  const todayStart = manilaBoundaries.startOfDay(now)
  const todayEnd = manilaBoundaries.endOfDay(now)
  const weekEnd = new Date(todayEnd.getTime() + 7 * 86400 * 1000)

  // Overdue count is computed for every tab so the badge is always accurate.
  const overdueRowsAll = await db
    .select({ id: dailyTasks.id })
    .from(dailyTasks)
    .where(
      and(
        eq(dailyTasks.tenant_id, profile.tenantId),
        eq(dailyTasks.assignee_id, profile.user.id),
        eq(dailyTasks.status, 'pending'),
        lt(dailyTasks.due_date, now),
      ),
    )
  const overdueCount = overdueRowsAll.length

  let rows: TaskJoinedRow[] = []
  let isReadOnly = false
  let overdueInTab = false

  if (tab === 'today') {
    rows = await db
      .select(TASK_COLUMNS)
      .from(dailyTasks)
      .innerJoin(projects, eq(projects.id, dailyTasks.project_id))
      .where(
        and(
          eq(dailyTasks.tenant_id, profile.tenantId),
          eq(dailyTasks.assignee_id, profile.user.id),
          eq(dailyTasks.status, 'pending'),
          gte(dailyTasks.due_date, todayStart),
          lte(dailyTasks.due_date, todayEnd),
        ),
      )
      .orderBy(asc(dailyTasks.due_date))
  } else if (tab === 'overdue') {
    rows = await db
      .select(TASK_COLUMNS)
      .from(dailyTasks)
      .innerJoin(projects, eq(projects.id, dailyTasks.project_id))
      .where(
        and(
          eq(dailyTasks.tenant_id, profile.tenantId),
          eq(dailyTasks.assignee_id, profile.user.id),
          eq(dailyTasks.status, 'pending'),
          lt(dailyTasks.due_date, now),
        ),
      )
      .orderBy(asc(dailyTasks.due_date))
    overdueInTab = true
  } else if (tab === 'week') {
    rows = await db
      .select(TASK_COLUMNS)
      .from(dailyTasks)
      .innerJoin(projects, eq(projects.id, dailyTasks.project_id))
      .where(
        and(
          eq(dailyTasks.tenant_id, profile.tenantId),
          eq(dailyTasks.assignee_id, profile.user.id),
          eq(dailyTasks.status, 'pending'),
          gt(dailyTasks.due_date, todayEnd),
          lte(dailyTasks.due_date, weekEnd),
        ),
      )
      .orderBy(asc(dailyTasks.due_date))
  } else {
    rows = await db
      .select(TASK_COLUMNS)
      .from(dailyTasks)
      .innerJoin(projects, eq(projects.id, dailyTasks.project_id))
      .where(
        and(
          eq(dailyTasks.tenant_id, profile.tenantId),
          eq(dailyTasks.assignee_id, profile.user.id),
          eq(dailyTasks.status, 'done'),
        ),
      )
      .orderBy(desc(dailyTasks.completed_at))
      .limit(50)
    isReadOnly = true
  }

  // Group by project name for stable section ordering.
  const grouped = new Map<string, TaskRowData[]>()
  for (const r of rows) {
    const bucket = grouped.get(r.project_name) ?? []
    bucket.push(r)
    grouped.set(r.project_name, bucket)
  }
  const projectGroups = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Construction</p>
        <h1 className="page-title">My Tasks</h1>
        <p className="page-subtitle">
          Daily cadence assigned to {profile.fullName || profile.email}.
          {overdueCount > 0 && (
            <>
              {' '}
              <Link
                href="/tasks?tab=overdue"
                style={{ color: 'var(--color-danger)', fontWeight: 600, textDecoration: 'none' }}
              >
                {overdueCount} overdue
              </Link>
              .
            </>
          )}
        </p>
      </div>

      <nav
        aria-label="Task tabs"
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--color-border)',
          marginBottom: 16,
        }}
      >
        {TAB_ORDER.map((key) => {
          const active = key === tab
          const badge = key === 'overdue' && overdueCount > 0 ? overdueCount : null
          return (
            <Link
              key={key}
              href={key === 'today' ? '/tasks' : `/tasks?tab=${key}`}
              style={{
                padding: '8px 14px',
                fontSize: '0.875rem',
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--color-navy-700)' : 'var(--color-neutral-600)',
                borderBottom: active ? '2px solid var(--color-navy-700)' : '2px solid transparent',
                marginBottom: '-1px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {TAB_LABELS[key]}
              {badge !== null && (
                <span
                  style={{
                    background: 'var(--color-danger)',
                    color: 'white',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 999,
                  }}
                >
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="card">
          <div className="card-empty">
            {tab === 'today' && 'No tasks today. Generate them from /admin (admin only).'}
            {tab === 'overdue' && 'Nothing overdue. Nice work.'}
            {tab === 'week' && 'No upcoming tasks this week.'}
            {tab === 'completed' && 'No completed tasks yet.'}
          </div>
        </div>
      ) : (
        projectGroups.map(([projectName, tasks]) => (
          <div className="card" key={projectName} style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h2 className="card-title">{projectName}</h2>
              <span className="muted">{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Project</th>
                  <th>Role</th>
                  <th>Due</th>
                  <th style={{ width: 280 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    overdue={overdueInTab}
                    readOnly={isReadOnly}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}
