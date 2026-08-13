import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { opportunities, projects } from '@third-code-erp/database/schema'
import { and, eq, inArray, desc } from 'drizzle-orm'
import { formatCentsCompact } from '@third-code-erp/shared-types'
import { StageAdvanceButton } from '@/components/pipeline/stage-advance-button'

export const metadata: Metadata = { title: 'Conversion Pipeline' }

const ACTIVE_STAGES = ['scoping', 'bom_submission', 'resubmission', 'negotiation'] as const

const STAGE_LABELS: Record<string, string> = {
  scoping: 'Scoping',
  bom_submission: 'BOM Submission',
  resubmission: 'Resubmission',
  negotiation: 'Negotiation',
}

const STAGE_COLORS: Record<string, string> = {
  scoping: '#6366f1',
  bom_submission: '#f59e0b',
  resubmission: '#f97316',
  negotiation: '#10b981',
}

export default async function ConversionPage() {
  const profile = await requireUserProfile()

  const opps = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      probability: opportunities.probability,
      tcv_cents: opportunities.tcv_cents,
      gp_cents: opportunities.gp_cents,
      weighted_tcv_cents: opportunities.weighted_tcv_cents,
      closing_date: opportunities.closing_date,
      created_at: opportunities.created_at,
      project_name: projects.name,
      project_client: projects.client,
      project_id: projects.id,
    })
    .from(opportunities)
    .leftJoin(
      projects,
      and(
        eq(opportunities.project_id, projects.id),
        eq(projects.tenant_id, profile.tenantId)
      )
    )
    .where(
      and(
        eq(opportunities.tenant_id, profile.tenantId),
        inArray(opportunities.stage, [...ACTIVE_STAGES])
      )
    )
    .orderBy(desc(opportunities.tcv_cents))

  const totalWeighted = opps.reduce((acc, o) => acc + o.weighted_tcv_cents, 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Conversion</h1>
          <p className="page-subtitle">
            {opps.length} deal{opps.length !== 1 ? 's' : ''} · {formatCentsCompact(totalWeighted)} weighted pipeline
          </p>
        </div>
      </div>

      {/* Stage tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)' }}>
        {[
          { label: 'Coverage', href: '/pipeline/coverage', active: false },
          { label: 'Conversion', href: '/pipeline/conversion', active: true },
        ].map(({ label, href, active }) => (
          <Link
            key={label}
            href={href}
            style={{
              padding: '8px 16px',
              fontSize: '0.875rem',
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--color-navy-700)' : 'var(--color-neutral-500)',
              textDecoration: 'none',
              borderBottom: active ? '2px solid var(--color-navy-700)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {label}
          </Link>
        ))}
      </div>

      {opps.length === 0 ? (
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '64px 24px',
            textAlign: 'center',
            color: 'var(--color-neutral-400)',
          }}
        >
          <p style={{ fontSize: '0.875rem' }}>No active deals in conversion stages.</p>
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project / Client</th>
                <th>Stage</th>
                <th className="numeric">Prob %</th>
                <th className="numeric">TCV</th>
                <th className="numeric">GP</th>
                <th className="numeric">GP %</th>
                <th className="numeric">Weighted TCV</th>
                <th>Est. Close</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {opps.map((opp) => {
                const gpPct = opp.tcv_cents > 0 ? (opp.gp_cents / opp.tcv_cents) * 100 : 0
                return (
                  <tr key={opp.id}>
                    <td>
                      <Link
                        href={`/projects/${opp.project_id}`}
                        style={{ color: 'var(--color-navy-700)', fontWeight: 500, textDecoration: 'none' }}
                      >
                        {opp.project_name ?? '—'}
                      </Link>
                      <span style={{ color: 'var(--color-neutral-400)', fontSize: '0.75rem', marginLeft: '8px' }}>
                        {opp.project_client}
                      </span>
                    </td>
                    <td>
                      <span
                        className="stage-badge"
                        style={{
                          color: STAGE_COLORS[opp.stage] ?? 'inherit',
                          background: (STAGE_COLORS[opp.stage] ?? '#6b7280') + '18',
                        }}
                      >
                        {STAGE_LABELS[opp.stage] ?? opp.stage}
                      </span>
                    </td>
                    <td className="numeric">{opp.probability}%</td>
                    <td className="currency">{formatCentsCompact(opp.tcv_cents)}</td>
                    <td className="currency">{formatCentsCompact(opp.gp_cents)}</td>
                    <td
                      className="numeric"
                      style={{ color: gpPct >= 20 ? 'var(--color-success)' : 'inherit' }}
                    >
                      {gpPct.toFixed(1)}%
                    </td>
                    <td className="currency">{formatCentsCompact(opp.weighted_tcv_cents)}</td>
                    <td style={{ color: 'var(--color-neutral-500)', fontSize: '0.8125rem' }}>
                      {opp.closing_date
                        ? new Date(opp.closing_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td>
                      <StageAdvanceButton opportunityId={opp.id} currentStage={opp.stage} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
