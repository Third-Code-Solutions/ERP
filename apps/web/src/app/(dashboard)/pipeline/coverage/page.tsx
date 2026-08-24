import type { Metadata } from 'next'
import Link from 'next/link'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { accounts, opportunities, projects } from '@third-code-erp/database/schema'
import { and, eq, desc, inArray } from 'drizzle-orm'
import { formatCentsCompact } from '@third-code-erp/shared-types'
import { LEAD_OPPORTUNITY_STAGES } from '@/lib/sales-dashboard-pipeline'

export const metadata: Metadata = { title: 'Coverage Pipeline' }

export default async function CoveragePage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'opportunity.read')

  const leads = await db
      .select({
        id: opportunities.id,
        stage: opportunities.stage,
        tcv_cents: opportunities.tcv_cents,
        gp_cents: opportunities.gp_cents,
        area_sqm: opportunities.area_sqm,
        opportunity_type: opportunities.opportunity_type,
        closing_date: opportunities.closing_date,
        created_at: opportunities.created_at,
        project_name: projects.name,
        project_client: projects.client,
        project_id: projects.id,
        account_id: opportunities.account_id,
        account_name: accounts.name,
      })
      .from(opportunities)
      .leftJoin(
        projects,
        and(
          eq(opportunities.project_id, projects.id),
          eq(projects.tenant_id, profile.tenantId)
        )
      )
      .leftJoin(
        accounts,
        and(
          eq(opportunities.account_id, accounts.id),
          eq(accounts.tenant_id, profile.tenantId)
        )
      )
      .where(
        and(
          eq(opportunities.tenant_id, profile.tenantId),
          inArray(opportunities.stage, LEAD_OPPORTUNITY_STAGES)
        )
      )
      .orderBy(desc(opportunities.created_at))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Coverage</h1>
          <p className="page-subtitle">{leads.length} lead{leads.length !== 1 ? 's' : ''} in pipeline</p>
        </div>
        <Link
          href="/crm/opportunities/new/pprf"
          style={{
            padding: '7px 14px',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'white',
            textDecoration: 'none',
            borderRadius: '6px',
            background: 'var(--color-navy-700)',
          }}
        >
          + Start PPRF intake
        </Link>
      </div>

      {/* Stage tab navigation */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)' }}>
        {[
          { label: 'Coverage', href: '/pipeline/coverage', active: true },
          { label: 'Conversion', href: '/pipeline/conversion', active: false },
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

      {leads.length === 0 ? (
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
          <p style={{ fontSize: '0.875rem', margin: '0 0 16px' }}>No leads in coverage yet.</p>
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project / Client</th>
                <th>Type</th>
                <th className="numeric">Area (sqm)</th>
                <th className="numeric">Expected TCV</th>
                <th className="numeric">Expected GP</th>
                <th>Est. Close</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((opp) => (
                <tr key={opp.id}>
                  <td>
                    <Link
                      href={`/crm/opportunities/${opp.id}`}
                      style={{ color: 'var(--color-navy-700)', fontWeight: 500, textDecoration: 'none' }}
                    >
                      {opp.account_name ?? opp.project_name ?? 'Opportunity'}
                    </Link>
                    <span style={{ color: 'var(--color-neutral-400)', fontSize: '0.75rem', marginLeft: '8px' }}>
                      {opp.project_name ?? opp.project_client ?? '—'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-neutral-500)', fontSize: '0.8125rem' }}>
                    {opp.opportunity_type ?? '—'}
                  </td>
                  <td className="numeric">{opp.area_sqm?.toLocaleString() ?? '—'}</td>
                  <td className="currency">{opp.tcv_cents > 0 ? formatCentsCompact(opp.tcv_cents) : '—'}</td>
                  <td className="currency">{opp.gp_cents > 0 ? formatCentsCompact(opp.gp_cents) : '—'}</td>
                  <td style={{ color: 'var(--color-neutral-500)', fontSize: '0.8125rem' }}>
                    {opp.closing_date
                      ? new Date(opp.closing_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </td>
                  <td style={{ color: 'var(--color-neutral-400)', fontSize: '0.75rem' }}>
                    {new Date(opp.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
