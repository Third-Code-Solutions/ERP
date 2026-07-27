import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { progressClaims, projects } from '@third-code-erp/database/schema'
import { ClaimListTable } from '@/components/claims/claim-list-table'

export const metadata: Metadata = { title: 'Progress claims' }

interface SearchParams {
  status?: string
}

// Status grouping for the KPI cards.
const IN_REVIEW = new Set(['submitted', 'certificate_pending', 'certified'])
const AWAITING_PAYMENT = new Set(['handed_over_finance', 'invoiced'])

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'certificate_pending', label: 'Cert. pending' },
  { value: 'certified', label: 'Certified' },
  { value: 'handed_over_finance', label: 'With Finance' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

const KNOWN_STATUSES: Set<string> = new Set(STATUS_FILTER_OPTIONS.map((o) => o.value))

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const profile = await requireUserProfile()
  const { status: rawStatus } = await searchParams
  const activeStatus =
    rawStatus && KNOWN_STATUSES.has(rawStatus) && rawStatus !== 'all' ? rawStatus : null

  // We pull a generous list (200) so KPI math is exact for the visible
  // window. If the system ever exceeds that, the KPI cards should move
  // to dedicated aggregate queries — but for now this matches the
  // punchlist pattern and keeps the page server-rendered in one round
  // trip.
  const allRows = await db
    .select({
      id: progressClaims.id,
      claim_number: progressClaims.claim_number,
      project_id: progressClaims.project_id,
      project_name: projects.name,
      milestone_pct: progressClaims.milestone_pct,
      amount_cents: progressClaims.amount_cents,
      status: progressClaims.status,
      created_at: progressClaims.created_at,
      paid_at: progressClaims.paid_at,
    })
    .from(progressClaims)
    .innerJoin(projects, eq(projects.id, progressClaims.project_id))
    .where(eq(progressClaims.tenant_id, profile.tenantId))
    .orderBy(desc(progressClaims.created_at))
    .limit(200)

  const draftCount = allRows.filter((r) => r.status === 'draft').length
  const inReviewCount = allRows.filter((r) => IN_REVIEW.has(r.status as string)).length
  const awaitingPaymentCount = allRows.filter((r) =>
    AWAITING_PAYMENT.has(r.status as string)
  ).length

  // Paid-this-month: paid_at within the current calendar month (PH tz
  // approximation via local time on the server).
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const paidThisMonth = allRows.filter((r) => {
    if (r.status !== 'paid' || !r.paid_at) return false
    const paidAt = new Date(r.paid_at as unknown as string)
    return paidAt >= monthStart
  }).length

  const visibleRows = activeStatus
    ? allRows.filter((r) => r.status === activeStatus)
    : allRows

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div className="page-header" style={{ flex: 1 }}>
          <p className="page-eyebrow">Execution</p>
          <h1 className="page-title">Progress claims</h1>
          <p className="page-subtitle">
            Milestone-based billing claims tracked from draft to paid.
          </p>
        </div>
        <Link
          href="/claims/new"
          style={{
            background: 'var(--color-navy-700)',
            color: 'white',
            padding: '9px 16px',
            borderRadius: 6,
            fontSize: '0.875rem',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            marginTop: 4,
          }}
        >
          + New claim
        </Link>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Kpi label="Draft" value={draftCount.toString()} />
        <Kpi label="In review" value={inReviewCount.toString()} hint="Submitted · cert. pending · certified" />
        <Kpi
          label="Awaiting payment"
          value={awaitingPaymentCount.toString()}
          hint="With Finance · invoiced"
        />
        <Kpi label="Paid this month" value={paidThisMonth.toString()} />
      </div>

      <div className="card">
        <div
          className="card-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <h2 className="card-title">
            {visibleRows.length} claim{visibleRows.length === 1 ? '' : 's'}
            {activeStatus ? <span className="muted"> · filtered</span> : null}
          </h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_FILTER_OPTIONS.map((opt) => {
              const isActive =
                opt.value === 'all' ? activeStatus === null : opt.value === activeStatus
              const href = opt.value === 'all' ? '/claims' : `/claims?status=${opt.value}`
              return (
                <Link
                  key={opt.value}
                  href={href}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: 999,
                    textDecoration: 'none',
                    border: '1px solid',
                    borderColor: isActive ? 'var(--color-navy-700)' : 'var(--color-border)',
                    color: isActive ? 'white' : 'var(--color-neutral-600)',
                    background: isActive ? 'var(--color-navy-700)' : 'white',
                  }}
                >
                  {opt.label}
                </Link>
              )
            })}
          </div>
        </div>
        <ClaimListTable rows={visibleRows} />
      </div>
    </div>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="kpi-card">
      <p className="kpi-card-label">{label}</p>
      <p className="kpi-card-value">{value}</p>
      {hint ? (
        <p
          style={{
            fontSize: '0.6875rem',
            color: 'var(--color-neutral-500)',
            margin: '4px 0 0 0',
            lineHeight: 1.3,
          }}
        >
          {hint}
        </p>
      ) : null}
    </div>
  )
}
