import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { requireUserProfile } from '@buildops/auth'
import { db } from '@buildops/database'
import { projects } from '@buildops/database/schema'
import { SCurveChart } from '@/components/progress/s-curve-chart'
import { GanttChart } from '@/components/progress/gantt-chart'
import { ProgressViewToggle } from '@/components/progress/progress-view-toggle'
import { MasterScheduleImport } from '@/components/progress/master-schedule-import'
import { WeeklyUpdateForm } from '@/components/progress/weekly-update-form'
import { loadProgressContext } from './actions'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string }>
}

type ProgressView = 'curve' | 'gantt'

interface MasterTask {
  name: string
  start_date: string
  finish_date: string
  predecessor_index: number | null
  planned_pct_curve: number[]
}

interface PercentByCategory {
  civil_pct: number
  electrical_pct: number
  mep_pct: number
  finishes_pct: number
  overall_pct: number
}

/**
 * Derive the project-level planned curve as the per-week average of all
 * task curves (padded to the longest task). Keeps the chart meaningful
 * even when individual tasks have different week-counts.
 */
function deriveProjectPlannedCurve(tasks: MasterTask[]): number[] {
  if (tasks.length === 0) return []
  const maxLen = tasks.reduce((m, t) => Math.max(m, t.planned_pct_curve.length), 0)
  if (maxLen === 0) return []
  const result: number[] = []
  for (let w = 0; w < maxLen; w++) {
    let sum = 0
    let count = 0
    for (const t of tasks) {
      const v = t.planned_pct_curve[w]
      if (typeof v === 'number') {
        sum += v
        count++
      } else if (t.planned_pct_curve.length > 0) {
        // Pad with task's final value so completed tasks stay at 100%.
        sum += t.planned_pct_curve[t.planned_pct_curve.length - 1]!
        count++
      }
    }
    result.push(count > 0 ? Math.round((sum / count) * 10) / 10 : 0)
  }
  return result
}

export default async function ProjectProgressPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const { view: viewParam } = await searchParams
  const view: ProgressView = viewParam === 'gantt' ? 'gantt' : 'curve'
  const profile = await requireUserProfile()

  const [project] = await db
    .select({ id: projects.id, name: projects.name, status: projects.status })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)

  if (!project) notFound()

  const { schedule, updates } = await loadProgressContext(id, profile.tenantId)
  const tasks = (schedule?.tasks ?? []) as MasterTask[]
  const planned = deriveProjectPlannedCurve(tasks)
  const actual = updates.map(
    (u) => (u.percent_by_category as PercentByCategory).overall_pct ?? 0,
  )
  const latestUpdate = updates[updates.length - 1] ?? null
  const latestPct =
    (latestUpdate?.percent_by_category as PercentByCategory | null) ?? null

  // v1: apply the latest overall_pct uniformly to every Gantt task. A future
  // pass with a task_id link would let us drive this per-task.
  const ganttActualPct = latestPct?.overall_pct
  const ganttTasks = tasks.map((t) => ({
    name: t.name,
    start_date: t.start_date,
    finish_date: t.finish_date,
    predecessor_index: t.predecessor_index ?? undefined,
    actual_pct: typeof ganttActualPct === 'number' ? ganttActualPct : undefined,
  }))

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link
            href={`/projects/${id}`}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            Projects · {project.name}
          </Link>
        </p>
        <div className="page-toolbar">
          <div>
            <h1 className="page-title">Progress</h1>
            <p className="page-subtitle">
              Weekly S-curve, milestone notifications, and the L1 master schedule.
            </p>
          </div>
        </div>
      </div>

      <div className="section-grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card">
            <div
              className="card-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <h2 className="card-title">
                {view === 'gantt' ? 'Gantt timeline' : 'S-Curve'}
              </h2>
              <ProgressViewToggle
                view={view}
                baseHref={`/projects/${id}/progress`}
              />
            </div>
            <div style={{ padding: 16 }}>
              {view === 'gantt' ? (
                <GanttChart tasks={ganttTasks} />
              ) : (
                <SCurveChart planned={planned} actual={actual} />
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Weekly history ({updates.length})</h2>
            </div>
            {updates.length === 0 ? (
              <div className="card-empty">
                No weekly updates yet — submit the first one to start the curve.
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Week ending</th>
                    <th className="numeric">Civil</th>
                    <th className="numeric">Elec</th>
                    <th className="numeric">MEP</th>
                    <th className="numeric">Finishes</th>
                    <th className="numeric">Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {[...updates].reverse().map((u) => {
                    const p = u.percent_by_category as PercentByCategory
                    return (
                      <tr key={u.id}>
                        <td>
                          {new Date(u.week_ending).toLocaleDateString('en-PH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="numeric">{p.civil_pct}%</td>
                        <td className="numeric">{p.electrical_pct}%</td>
                        <td className="numeric">{p.mep_pct}%</td>
                        <td className="numeric">{p.finishes_pct}%</td>
                        <td className="numeric" style={{ fontWeight: 600 }}>
                          {p.overall_pct}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Master schedule (L1)</h2>
            </div>
            <div style={{ padding: 16 }}>
              <MasterScheduleImport projectId={id} hasExisting={Boolean(schedule)} />
            </div>
            {tasks.length > 0 && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Start</th>
                    <th>Finish</th>
                    <th className="numeric">Weeks</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t, i) => (
                    <tr key={`${t.name}-${i}`}>
                      <td>{t.name}</td>
                      <td className="muted">{t.start_date}</td>
                      <td className="muted">{t.finish_date}</td>
                      <td className="numeric">{t.planned_pct_curve.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Submit weekly update</h2>
            </div>
            <div style={{ padding: 16 }}>
              <WeeklyUpdateForm projectId={id} />
            </div>
          </div>

          {latestPct && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Latest</h2>
              </div>
              <div
                style={{
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <PctRow label="Civil" value={latestPct.civil_pct} />
                <PctRow label="Electrical" value={latestPct.electrical_pct} />
                <PctRow label="MEP" value={latestPct.mep_pct} />
                <PctRow label="Finishes" value={latestPct.finishes_pct} />
                <div
                  style={{
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: 8,
                    marginTop: 4,
                  }}
                >
                  <PctRow label="Overall" value={latestPct.overall_pct} emphasis />
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function PctRow({
  label,
  value,
  emphasis,
}: {
  label: string
  value: number
  emphasis?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--color-neutral-500)' }}>{label}</span>
      <span
        style={{
          color: emphasis ? 'var(--color-navy-700)' : 'var(--color-neutral-900)',
          fontWeight: emphasis ? 600 : 500,
        }}
      >
        {value}%
      </span>
    </div>
  )
}
