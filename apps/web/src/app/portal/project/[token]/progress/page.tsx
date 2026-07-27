import type { Metadata } from 'next'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import { findActiveCustomerSession } from '@/lib/operations/customer-portal'
import { SCurveChart } from '@/components/progress/s-curve-chart'
import { PortalProgressSummary } from '@/components/customer-portal/portal-progress-summary'
import { PortalWeeklyList } from '@/components/customer-portal/portal-weekly-list'

export const metadata: Metadata = {
  title: 'Project Progress',
  robots: { index: false, follow: false },
}

// Force dynamic rendering — per-link token must never be cached/prerendered.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ token: string }>
}

interface PercentByCategory {
  civil_pct?: number
  electrical_pct?: number
  mep_pct?: number
  finishes_pct?: number
  overall_pct?: number
}

interface MasterTask {
  name?: string
  start_date?: string
  finish_date?: string
  predecessor_index?: number | null
  planned_pct_curve?: number[]
}

interface ProgressUpdateRow {
  id: string
  week_ending: string
  percent_by_category: PercentByCategory
  notes: string | null
}

interface MasterScheduleRow {
  id: string
  tasks: MasterTask[] | null
}

interface WeeklyReportRow {
  id: string
  week_ending: string
  snapshot: Record<string, unknown> | null
}

const PROGRESS_LIMIT = 20
const WEEKLY_REPORT_LIMIT = 12

/**
 * Project-level planned cumulative curve = per-week average of every task's
 * planned_pct_curve. Tasks shorter than the longest are padded with their
 * final value so completed tasks remain at 100%.
 */
function deriveProjectPlannedCurve(tasks: MasterTask[]): number[] {
  if (tasks.length === 0) return []
  const curves = tasks
    .map((t) => (Array.isArray(t.planned_pct_curve) ? t.planned_pct_curve : []))
    .filter((c) => c.length > 0)
  if (curves.length === 0) return []
  const maxLen = curves.reduce((m, c) => Math.max(m, c.length), 0)
  const result: number[] = []
  for (let w = 0; w < maxLen; w++) {
    let sum = 0
    let count = 0
    for (const c of curves) {
      const v = c[w]
      if (typeof v === 'number' && Number.isFinite(v)) {
        sum += v
      } else {
        sum += c[c.length - 1]!
      }
      count++
    }
    result.push(count > 0 ? Math.round((sum / count) * 10) / 10 : 0)
  }
  return result
}

/**
 * Compare the latest actual cumulative % against the planned curve to derive a
 * friendly variance label. Returns null when we can't make a meaningful claim.
 */
function computeVariance(
  planned: number[],
  actual: number[],
): { label: string; tone: 'success' | 'warning' | 'danger' } | null {
  if (planned.length === 0 || actual.length === 0) return null
  const currentActual = actual[actual.length - 1] ?? 0
  const currentWeekIndex = actual.length - 1
  const idx = planned.findIndex((p) => p >= currentActual)
  if (idx === -1) {
    return { label: 'Ahead of schedule', tone: 'success' }
  }
  const varianceWeeks = idx - currentWeekIndex
  const days = varianceWeeks * 7
  if (days === 0) return { label: 'On schedule', tone: 'success' }
  if (days > 0) return { label: `${days} days ahead`, tone: 'success' }
  return { label: `${Math.abs(days)} days behind`, tone: 'danger' }
}

function PortalStatus({
  title,
  body,
  tone = 'neutral',
}: {
  title: string
  body: string
  tone?: 'neutral' | 'positive'
}) {
  return (
    <section
      style={{
        background: 'white',
        border: '1px solid #d8dde6',
        borderRadius: 10,
        padding: '40px 32px',
        textAlign: 'center',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 22,
          color: tone === 'positive' ? '#0F2D4A' : '#4b5563',
        }}
      >
        {title}
      </h2>
      <p style={{ margin: '10px 0 0', fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
        {body}
      </p>
    </section>
  )
}

export default async function PortalProjectProgressPage({ params }: PageProps) {
  const { token } = await params

  // Stateless consistency guard. The parent layout already renders the
  // proper Expired state for invalid links — we mirror that posture here.
  const session = await findActiveCustomerSession(token)
  if (!session) {
    return (
      <PortalStatus
        title="Link unavailable"
        body="This portal link is no longer active. Please ask your project contact to send a new one."
      />
    )
  }

  const supabase = createSupabaseAdminClient()

  const [progressRes, scheduleRes, reportsRes] = await Promise.all([
    supabase
      .from('progress_updates')
      .select('id, week_ending, percent_by_category, notes')
      .eq('tenant_id', session.tenant_id)
      .eq('project_id', session.project_id)
      .order('week_ending', { ascending: false })
      .limit(PROGRESS_LIMIT),
    supabase
      .from('master_schedules')
      .select('id, tasks')
      .eq('tenant_id', session.tenant_id)
      .eq('project_id', session.project_id)
      .order('imported_at', { ascending: false })
      .limit(1),
    supabase
      .from('weekly_reports')
      .select('id, week_ending, snapshot')
      .eq('tenant_id', session.tenant_id)
      .eq('project_id', session.project_id)
      .order('week_ending', { ascending: false })
      .limit(WEEKLY_REPORT_LIMIT),
  ])

  const progressRows: ProgressUpdateRow[] = (progressRes.data ?? []).map((r) => ({
    id: r.id as string,
    week_ending: r.week_ending as string,
    percent_by_category: (r.percent_by_category ?? {}) as PercentByCategory,
    notes: (r.notes as string | null) ?? null,
  }))

  const scheduleRow: MasterScheduleRow | null = (() => {
    const raw = scheduleRes.data?.[0]
    if (!raw) return null
    return {
      id: raw.id as string,
      tasks: Array.isArray(raw.tasks) ? (raw.tasks as MasterTask[]) : null,
    }
  })()

  const reportRows: WeeklyReportRow[] = (reportsRes.data ?? []).map((r) => ({
    id: r.id as string,
    week_ending: r.week_ending as string,
    snapshot:
      r.snapshot && typeof r.snapshot === 'object'
        ? (r.snapshot as Record<string, unknown>)
        : null,
  }))

  // Build chart series (chronological order).
  const chronologicalUpdates = [...progressRows].reverse()
  const actualCurve = chronologicalUpdates.map(
    (u) => u.percent_by_category.overall_pct ?? 0,
  )
  const plannedCurve = deriveProjectPlannedCurve(scheduleRow?.tasks ?? [])
  const variance = computeVariance(plannedCurve, actualCurve)

  // Latest snapshot drives the summary card.
  const latest = progressRows[0] ?? null
  const latestPct = latest?.percent_by_category.overall_pct ?? null

  // Build the weekly list entries — join each progress_update with the
  // weekly_report sharing the same week_ending bucket (day-resolution).
  const reportByDay = new Map<string, WeeklyReportRow>()
  for (const r of reportRows) {
    reportByDay.set(new Date(r.week_ending).toISOString().slice(0, 10), r)
  }
  const listEntries = progressRows.map((u) => {
    const key = new Date(u.week_ending).toISOString().slice(0, 10)
    const matched = reportByDay.get(key) ?? null
    return {
      id: u.id,
      week_ending: u.week_ending,
      percent_by_category: u.percent_by_category,
      notes: u.notes,
      report_snapshot: matched?.snapshot ?? null,
    }
  })

  return (
    <div className="portal-progress-page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PortalProgressSummary
        overallPct={typeof latestPct === 'number' ? latestPct : null}
        weekEndingISO={latest?.week_ending ?? null}
        varianceLabel={variance?.label ?? null}
        varianceTone={variance?.tone ?? null}
        note={latest?.notes ?? null}
      />

      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 10,
          padding: '20px 24px',
          boxShadow: '0 1px 2px rgba(15, 45, 74, 0.05)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 14,
            flexWrap: 'wrap',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 15, color: '#0F2D4A', fontWeight: 600 }}>
            Planned vs actual
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 11.5,
              color: '#6b7280',
              letterSpacing: '0.04em',
            }}
          >
            Cumulative completion by week
          </p>
        </div>
        <SCurveChart planned={plannedCurve} actual={actualCurve} />
      </section>

      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(15, 45, 74, 0.05)',
        }}
      >
        <div
          style={{
            background: '#0F2D4A',
            color: 'white',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          <span>Weekly snapshots</span>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
            {progressRows.length} {progressRows.length === 1 ? 'week' : 'weeks'}
          </span>
        </div>
        <PortalWeeklyList entries={listEntries} />
      </section>

      <style>{`
        @media (max-width: 700px) {
          .portal-progress-page {
            gap: 14px;
          }
        }
      `}</style>
    </div>
  )
}
