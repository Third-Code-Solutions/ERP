import type { Metadata } from 'next'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { opportunities, projects, boms, invoices } from '@third-code-erp/database/schema'
import { eq, sql } from 'drizzle-orm'
import Link from 'next/link'
import { canViewPath } from '@/lib/operations/nav-config'
import { formatReportMoney as formatPHP, formatReportMargin as formatMargin } from './report-format'

export const metadata: Metadata = { title: 'Reports' }

const ACTIVE_STAGES = ['opportunity_creation', 'scoping', 'bom_submission', 'resubmission', 'negotiation'] as const

export default async function ReportsPage() {
  const profile = await requireUserProfile()
  const tid = profile.tenantId

  const [allOpps, allProjects, allBoms, allInvoices] = await Promise.all([
    db.select({
      stage: opportunities.stage,
      tcv_cents: sql<string>`cast(${opportunities.tcv_cents} as text)`,
      gp_cents: sql<string>`cast(${opportunities.gp_cents} as text)`,
      weighted_tcv_cents: sql<string>`cast(${opportunities.weighted_tcv_cents} as text)`,
      probability: opportunities.probability,
    })
      .from(opportunities)
      .where(eq(opportunities.tenant_id, tid)),

    db.select({ status: projects.status, created_at: projects.created_at })
      .from(projects)
      .where(eq(projects.tenant_id, tid)),

    db.select({ status: boms.status, tcv_cents: sql<string>`cast(${boms.tcv_cents} as text)`, gp_cents: sql<string>`cast(${boms.gp_cents} as text)` })
      .from(boms)
      .where(eq(boms.tenant_id, tid)),

    db.select({ status: invoices.status, net_amount_cents: sql<string>`cast(${invoices.net_amount_cents} as text)` })
      .from(invoices)
      .where(eq(invoices.tenant_id, tid)),
  ])

  // Pipeline metrics
  const activeOpps = allOpps.filter((o) => ACTIVE_STAGES.includes(o.stage as typeof ACTIVE_STAGES[number]))
  const wonOpps = allOpps.filter((o) => o.stage === 'closed_won')
  const lostOpps = allOpps.filter((o) => o.stage === 'closed_lost')

  const pipelineTCV = activeOpps.reduce((s, o) => s + BigInt(o.tcv_cents), 0n)
  const pipelineGP = activeOpps.reduce((s, o) => s + BigInt(o.gp_cents), 0n)
  const weightedPipeline = activeOpps.reduce((s, o) => s + BigInt(o.weighted_tcv_cents), 0n)
  const wonTCV = wonOpps.reduce((s, o) => s + BigInt(o.tcv_cents), 0n)
  const wonGP = wonOpps.reduce((s, o) => s + BigInt(o.gp_cents), 0n)

  // Billing metrics
  const billedTotal = allInvoices.filter((i) => i.status !== 'draft' && i.status !== 'cancelled')
    .reduce((s, i) => s + BigInt(i.net_amount_cents), 0n)
  const collectedTotal = allInvoices.filter((i) => i.status === 'paid')
    .reduce((s, i) => s + BigInt(i.net_amount_cents), 0n)

  // Project stats
  const activeProjects = allProjects.filter((p) => p.status === 'active').length
  const completedProjects = allProjects.filter((p) => p.status === 'completed').length

  // BOM stats
  const approvedBoms = allBoms.filter((b) => b.status === 'approved' || b.status === 'locked').length
  const totalBomTCV = allBoms.filter((b) => b.status !== 'archived').reduce((s, b) => s + BigInt(b.tcv_cents), 0n)

  // Stage distribution
  const stageOrder = ['opportunity_creation', 'scoping', 'bom_submission', 'resubmission', 'negotiation']
  const stageCounts = stageOrder.map((stage) => {
    const opps = allOpps.filter((o) => o.stage === stage)
    return {
      stage,
      label: {
        opportunity_creation: 'Opp. Creation',
        scoping: 'Scoping',
        bom_submission: 'BOM Submission',
        resubmission: 'Resubmission',
        negotiation: 'Negotiation',
      }[stage] ?? stage,
      count: opps.length,
      tcv: opps.reduce((s, o) => s + BigInt(o.tcv_cents), 0n),
      gp: opps.reduce((s, o) => s + BigInt(o.gp_cents), 0n),
    }
  })

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Pipeline, GP, and compliance summary</p>
        {can(profile.role, 'opportunity.export') ? <a href="/api/exports/opportunities-csv" download className="button button-secondary">Export pipeline CSV</a> : null}
      </div>
      {allOpps.length === 0 && allProjects.length === 0 && allBoms.length === 0 && allInvoices.length === 0 ? <p role="status">No reporting records exist in this workspace yet. Add an account, opportunity, or project to begin.</p> : null}

      {/* Section: Pipeline */}
      <h2 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
        Pipeline
      </h2>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
        {[
          { label: 'Active Deals', value: String(activeOpps.length), mono: false },
          { label: 'Pipeline TCV', value: formatPHP(pipelineTCV), mono: true },
          { label: 'Pipeline GP', value: formatPHP(pipelineGP), mono: true },
          { label: 'Weighted Pipeline', value: formatPHP(weightedPipeline), mono: true },
          { label: 'GP Margin', value: formatMargin(pipelineGP, pipelineTCV), mono: true },
        ].map(({ label, value, mono }) => (
          <div
            key={label}
            style={{
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '14px 20px',
              minWidth: '160px',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
              {label}
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-neutral-900)', fontFamily: mono ? 'var(--font-mono)' : undefined }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Section: Won / Lost */}
      <h2 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
        Closed Deals
      </h2>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
        {[
          { label: 'Won TCV', value: formatPHP(wonTCV), color: '#10b981' },
          { label: 'Won GP', value: formatPHP(wonGP), color: '#10b981' },
          { label: 'Won GP Margin', value: formatMargin(wonGP, wonTCV), color: '#10b981' },
          { label: 'Deals Won', value: String(wonOpps.length), color: '#10b981' },
          { label: 'Deals Lost', value: String(lostOpps.length), color: '#ef4444' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '14px 20px',
              minWidth: '140px',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
              {label}
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Section: Stage Breakdown */}
      <h2 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
        Stage Breakdown
      </h2>
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflowX: 'auto', marginBottom: '32px', maxWidth: '860px' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th className="numeric">Deals</th>
              <th className="numeric">TCV</th>
              <th className="numeric">GP</th>
              <th className="numeric">GP Margin</th>
            </tr>
          </thead>
          <tbody>
            {stageCounts.map((row) => (
              <tr key={row.stage}>
                <td style={{ fontSize: '0.875rem', color: 'var(--color-neutral-700)' }}>{row.label}</td>
                <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{row.count}</td>
                <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{formatPHP(row.tcv)}</td>
                <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{formatPHP(row.gp)}</td>
                <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{formatMargin(row.gp, row.tcv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section: Ops Summary */}
      <h2 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
        Operations Summary
      </h2>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
        {[
          { label: 'Active Projects', value: String(activeProjects) },
          { label: 'Completed Projects', value: String(completedProjects) },
          { label: 'Approved BOMs', value: String(approvedBoms) },
          { label: 'BOM Pipeline TCV', value: formatPHP(totalBomTCV) },
          { label: 'Total Billed', value: formatPHP(billedTotal) },
          { label: 'Paid invoice total', value: formatPHP(collectedTotal) },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '14px 20px',
              minWidth: '150px',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
              {label}
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-neutral-900)', fontFamily: 'var(--font-mono)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: 'var(--color-navy-50)',
          border: '1px solid var(--color-navy-100)',
          borderRadius: '8px',
          padding: '16px 20px',
          fontSize: '0.8125rem',
          color: 'var(--color-navy-700)',
          maxWidth: '860px',
        }}
      >
        <p>These tenant-scoped summaries refresh when this page loads. <Link href="/dashboard">Open Dashboard</Link> for role-specific operational detail.</p>
        <p>Paid invoice total sums invoices marked paid; it is not a cash-allocation or partial-collection balance.</p>
        {canViewPath(profile.role, '/invoices') ? <p><Link href="/invoices">Open Invoices</Link> to review billing and access an invoice’s BIR2307 export.</p> : null}
      </div>
    </div>
  )
}
