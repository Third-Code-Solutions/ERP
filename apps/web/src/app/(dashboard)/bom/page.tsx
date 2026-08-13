import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { boms, projects } from '@third-code-erp/database/schema'
import { and, eq, desc } from 'drizzle-orm'

export const metadata: Metadata = { title: 'BOM Builder' }

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  approved: 'Approved',
  locked: 'Locked',
  archived: 'Archived',
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  approved: '#10b981',
  locked: '#3b82f6',
  archived: '#6b7280',
}

function formatPHP(cents: number): string {
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatMargin(bps: number): string {
  return (bps / 100).toFixed(1) + '%'
}

export default async function BomBuilderPage() {
  const profile = await requireUserProfile()

  const rows = await db
    .select({
      id: boms.id,
      version: boms.version,
      label: boms.label,
      status: boms.status,
      total_cost_cents: boms.total_cost_cents,
      tcv_cents: boms.tcv_cents,
      gp_cents: boms.gp_cents,
      gp_margin_bps: boms.gp_margin_bps,
      approved_at: boms.approved_at,
      created_at: boms.created_at,
      project_name: projects.name,
      project_id: projects.id,
    })
    .from(boms)
    .leftJoin(
      projects,
      and(eq(boms.project_id, projects.id), eq(projects.tenant_id, profile.tenantId))
    )
    .where(eq(boms.tenant_id, profile.tenantId))
    .orderBy(desc(boms.created_at))

  const approvedCount = rows.filter((r) => r.status === 'approved' || r.status === 'locked').length
  const totalTCV = rows.filter((r) => r.status !== 'archived').reduce((s, r) => s + r.tcv_cents, 0)
  const totalGP = rows.filter((r) => r.status !== 'archived').reduce((s, r) => s + r.gp_cents, 0)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">BOM Builder</h1>
        <p className="page-subtitle">{rows.length} bill{rows.length !== 1 ? 's' : ''} of materials across all projects</p>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total BOMs', value: String(rows.length), color: 'var(--color-neutral-800)' },
          { label: 'Approved / Locked', value: String(approvedCount), color: '#10b981' },
          { label: 'Pipeline TCV', value: formatPHP(totalTCV), color: 'var(--color-navy-700)' },
          { label: 'Pipeline GP', value: formatPHP(totalGP), color: totalGP >= 0 ? '#10b981' : '#ef4444' },
        ].map(({ label, value, color }) => (
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
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
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
          <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>No BOMs yet.</p>
          <p style={{ fontSize: '0.8125rem' }}>
            BOMs are created from project scope.{' '}
            <Link href="/projects" style={{ color: 'var(--color-navy-700)' }}>
              Go to Projects
            </Link>
          </p>
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>BOM</th>
                <th>Project</th>
                <th>Status</th>
                <th className="numeric">Version</th>
                <th className="numeric">Cost</th>
                <th className="numeric">TCV</th>
                <th className="numeric">GP</th>
                <th className="numeric">Margin</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link
                      href={`/projects/${row.project_id}/bom`}
                      style={{ fontWeight: 500, color: 'var(--color-navy-700)', textDecoration: 'none', fontSize: '0.875rem' }}
                    >
                      {row.label ?? `BOM v${row.version}`}
                    </Link>
                  </td>
                  <td>
                    {row.project_id ? (
                      <Link
                        href={`/projects/${row.project_id}`}
                        style={{ color: 'var(--color-neutral-600)', textDecoration: 'none', fontSize: '0.875rem' }}
                      >
                        {row.project_name ?? '—'}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <span
                      className="stage-badge"
                      style={{
                        color: STATUS_COLORS[row.status] ?? '#9ca3af',
                        background: (STATUS_COLORS[row.status] ?? '#9ca3af') + '18',
                      }}
                    >
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    v{row.version}
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {formatPHP(row.total_cost_cents)}
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600 }}>
                    {formatPHP(row.tcv_cents)}
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: row.gp_cents >= 0 ? '#10b981' : '#ef4444' }}>
                    {formatPHP(row.gp_cents)}
                  </td>
                  <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {formatMargin(row.gp_margin_bps)}
                  </td>
                  <td style={{ color: 'var(--color-neutral-500)', fontSize: '0.8125rem' }}>
                    {new Date(row.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div
        style={{
          marginTop: '24px',
          background: 'var(--color-navy-50)',
          border: '1px solid var(--color-navy-100)',
          borderRadius: '8px',
          padding: '16px 20px',
          fontSize: '0.8125rem',
          color: 'var(--color-navy-700)',
        }}
      >
        DWG and DXF auto-extraction is live. Open any project, drop a CAD drawing on the Scope or BOM tab, and a draft BOM is generated automatically with RAG-priced lines from past projects.
      </div>
    </div>
  )
}
