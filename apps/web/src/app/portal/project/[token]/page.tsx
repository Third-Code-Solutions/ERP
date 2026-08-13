/**
 * Customer-portal project overview (REFACTOR.md Phase 10 — US-CP-001).
 *
 * Public read-only landing for the token holder. Surfaces:
 *   - Project completion % (from latest progress_update.percent_by_category.overall_pct)
 *   - Days into project (created_at → now)
 *   - Open punchlist count
 *   - Next 3 upcoming milestones (master_schedules.tasks where start_date > now)
 *   - Last 5 weekly reports
 *
 * Every query is scoped via the session row's tenant_id — never the URL
 * token alone, never any client input. The layout has already gated the
 * session via findActiveCustomerSession before we get here.
 *
 * On render we fire-and-forget a logCustomerView so the admin side can
 * see view counts in the access UI.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import {
  projects,
  progressUpdates,
  punchlistItems,
  masterSchedules,
  weeklyReports,
} from '@third-code-erp/database/schema'
import { findActiveCustomerSession } from '@/lib/operations/customer-portal'
import { PortalEmpty } from '@/components/customer-portal/portal-empty'
import { logView } from './actions'

export const metadata: Metadata = {
  title: 'Project overview · ABI OPS',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ token: string }>
}

interface ScheduleTask {
  name?: string
  start_date?: string
  finish_date?: string
}

interface ProgressByCategory {
  overall_pct?: number
  civil_pct?: number
  electrical_pct?: number
  mep_pct?: number
  finishes_pct?: number
}

function safeOverallPct(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0
  const v = (raw as ProgressByCategory).overall_pct
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, Math.round(v)))
}

function daysSince(date: Date | string): number {
  const d = date instanceof Date ? date : new Date(date)
  const ms = Date.now() - d.getTime()
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)))
}

function fmtDate(value: Date | string | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default async function PortalProjectOverviewPage({ params }: PageProps) {
  const { token } = await params
  const session = await findActiveCustomerSession(token)
  // Layout will already render an expired state when session is null — this
  // is defence-in-depth so a direct page hit never queries without scope.
  if (!session) return null

  // Stamp the view counter. Best-effort; never blocks rendering.
  void logView(session.id, session.tenant_id)

  const [
    projectRows,
    progressRows,
    punchlistRows,
    scheduleRows,
    reports,
  ] = await Promise.all([
    db
      .select({ id: projects.id, created_at: projects.created_at })
      .from(projects)
      .where(
        and(
          eq(projects.id, session.project_id),
          eq(projects.tenant_id, session.tenant_id),
        ),
      )
      .limit(1),
    db
      .select({
        percent_by_category: progressUpdates.percent_by_category,
        week_ending: progressUpdates.week_ending,
        notes: progressUpdates.notes,
      })
      .from(progressUpdates)
      .where(
        and(
          eq(progressUpdates.tenant_id, session.tenant_id),
          eq(progressUpdates.project_id, session.project_id),
        ),
      )
      .orderBy(desc(progressUpdates.week_ending))
      .limit(1),
    db
      .select({ id: punchlistItems.id })
      .from(punchlistItems)
      .where(
        and(
          eq(punchlistItems.tenant_id, session.tenant_id),
          eq(punchlistItems.project_id, session.project_id),
          eq(punchlistItems.status, 'open'),
        ),
      ),
    db
      .select({ tasks: masterSchedules.tasks })
      .from(masterSchedules)
      .where(
        and(
          eq(masterSchedules.tenant_id, session.tenant_id),
          eq(masterSchedules.project_id, session.project_id),
        ),
      )
      .orderBy(desc(masterSchedules.imported_at))
      .limit(1),
    db
      .select({
        id: weeklyReports.id,
        week_ending: weeklyReports.week_ending,
        report_document_id: weeklyReports.report_document_id,
      })
      .from(weeklyReports)
      .where(
        and(
          eq(weeklyReports.tenant_id, session.tenant_id),
          eq(weeklyReports.project_id, session.project_id),
        ),
      )
      .orderBy(desc(weeklyReports.week_ending))
      .limit(5),
  ])

  const project = projectRows[0]
  const latestProgress = progressRows[0]
  const schedule = scheduleRows[0]
  const punchOpen = punchlistRows.length

  const completionPct = safeOverallPct(latestProgress?.percent_by_category)
  const daysIntoProject = project?.created_at ? daysSince(project.created_at) : 0

  // Upcoming milestones: parse JSONB tasks, keep ones with future start_date,
  // sort by date, slice 3.
  const allTasks = Array.isArray(schedule?.tasks)
    ? (schedule!.tasks as ScheduleTask[])
    : []
  const now = Date.now()
  const upcoming = allTasks
    .filter((t) => {
      if (!t?.start_date) return false
      const ts = new Date(t.start_date).getTime()
      return Number.isFinite(ts) && ts > now
    })
    .sort(
      (a, b) =>
        new Date(a.start_date as string).getTime() -
        new Date(b.start_date as string).getTime(),
    )
    .slice(0, 3)

  return (
    <div>
      {/* KPI grid */}
      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
          boxShadow: '0 1px 2px rgba(15, 45, 74, 0.04)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
          }}
        >
          <KpiCard
            label="Project status"
            value={`${completionPct}%`}
            sublabel={
              latestProgress
                ? `As of ${fmtDate(latestProgress.week_ending)}`
                : 'No update yet'
            }
            emphasised
          />
          <KpiCard
            label="Days into project"
            value={daysIntoProject.toLocaleString('en-PH')}
            sublabel={
              project?.created_at
                ? `Started ${fmtDate(project.created_at)}`
                : '—'
            }
          />
          <KpiCard
            label="Open punchlist"
            value={punchOpen.toLocaleString('en-PH')}
            sublabel={
              punchOpen === 0 ? 'Nothing outstanding' : 'Items still open'
            }
          />
          <KpiCard
            label="Upcoming milestones"
            value={upcoming.length.toLocaleString('en-PH')}
            sublabel={
              upcoming[0]?.start_date
                ? `Next: ${fmtDate(upcoming[0].start_date)}`
                : 'None scheduled'
            }
          />
        </div>
      </section>

      {/* Upcoming milestones */}
      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 20,
          boxShadow: '0 1px 2px rgba(15, 45, 74, 0.04)',
        }}
      >
        <SectionHeading
          eyebrow="Schedule"
          title="Next 3 milestones"
          link={{ href: `/portal/project/${token}/progress`, label: 'See full schedule →' }}
        />
        {upcoming.length === 0 ? (
          <PortalEmpty
            title="No upcoming milestones"
            body="Once the master schedule is uploaded, the next planned milestones will appear here."
          />
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {upcoming.map((task, i) => (
              <li
                key={`${task.name ?? 'task'}-${i}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 14px',
                  background: '#fafbfc',
                  border: '1px solid #eef0f4',
                  borderRadius: 8,
                }}
              >
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      fontWeight: 500,
                      color: '#14213d',
                    }}
                  >
                    {task.name ?? 'Untitled milestone'}
                  </p>
                  {task.finish_date && (
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: 12,
                        color: '#6b7280',
                      }}
                    >
                      Finish target: {fmtDate(task.finish_date)}
                    </p>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: '#0F2D4A',
                    fontFamily: 'var(--font-jetbrains), monospace',
                  }}
                >
                  {fmtDate(task.start_date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Latest progress note */}
      {latestProgress?.notes && (
        <section
          style={{
            background: 'white',
            border: '1px solid #d8dde6',
            borderRadius: 12,
            padding: '20px 24px',
            marginBottom: 20,
            boxShadow: '0 1px 2px rgba(15, 45, 74, 0.04)',
          }}
        >
          <SectionHeading
            eyebrow="Latest update"
            title={`Week ending ${fmtDate(latestProgress.week_ending)}`}
          />
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: '#3a4a63',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {latestProgress.notes}
          </p>
        </section>
      )}

      {/* Recent weekly reports */}
      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 12,
          padding: '20px 24px',
          boxShadow: '0 1px 2px rgba(15, 45, 74, 0.04)',
        }}
      >
        <SectionHeading
          eyebrow="Reports"
          title="Last 5 weekly reports"
          link={{ href: `/portal/project/${token}/progress`, label: 'View all →' }}
        />
        {reports.length === 0 ? (
          <PortalEmpty
            title="No weekly reports yet"
            body="Your project team publishes a weekly snapshot every Friday. The most recent five will appear here."
          />
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/portal/project/${token}/progress`}
                  prefetch={false}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 14px',
                    background: '#fafbfc',
                    border: '1px solid #eef0f4',
                    borderRadius: 8,
                    textDecoration: 'none',
                    color: '#14213d',
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500 }}>
                    Weekly report · {fmtDate(r.week_ending)}
                  </span>
                  <span style={{ fontSize: 12, color: '#0F2D4A', fontWeight: 600 }}>
                    Open →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: string
  sublabel?: string
  emphasised?: boolean
}

function KpiCard({ label, value, sublabel, emphasised }: KpiCardProps) {
  return (
    <div
      style={{
        background: emphasised ? '#0F2D4A' : '#fafbfc',
        color: emphasised ? 'white' : '#14213d',
        border: emphasised ? '1px solid #0a233b' : '1px solid #eef0f4',
        borderRadius: 10,
        padding: 16,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: emphasised ? 'rgba(255,255,255,0.78)' : '#6b7280',
          fontWeight: 600,
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          fontFamily: 'var(--font-jetbrains), monospace',
          color: emphasised ? 'white' : '#0F2D4A',
        }}
      >
        {value}
      </p>
      {sublabel && (
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 12,
            color: emphasised ? 'rgba(255,255,255,0.78)' : '#6b7280',
          }}
        >
          {sublabel}
        </p>
      )}
    </div>
  )
}

interface SectionHeadingProps {
  eyebrow: string
  title: string
  link?: { href: string; label: string }
}

function SectionHeading({ eyebrow, title, link }: SectionHeadingProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: 12,
        marginBottom: 14,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#6b7280',
            fontWeight: 600,
          }}
        >
          {eyebrow}
        </p>
        <h2
          style={{
            margin: '4px 0 0',
            fontSize: 17,
            fontWeight: 600,
            color: '#0F2D4A',
            letterSpacing: '-0.005em',
          }}
        >
          {title}
        </h2>
      </div>
      {link && (
        <Link
          href={link.href}
          prefetch={false}
          style={{ fontSize: 13, color: '#0F2D4A', fontWeight: 500 }}
        >
          {link.label}
        </Link>
      )}
    </div>
  )
}
