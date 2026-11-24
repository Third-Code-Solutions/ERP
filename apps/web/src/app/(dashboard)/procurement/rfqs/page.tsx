/**
 * RFQ list (REFACTOR.md M3 US-013).
 *
 * One row per RFQ in the tenant. We join through boms → projects to surface
 * a meaningful BOM label, and aggregate quote count per RFQ for the table.
 */

import type { Metadata } from 'next'
import { eq, sql, desc } from 'drizzle-orm'
import { requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { rfqs, rfqQuotes, boms, projects } from '@third-code-erp/database/schema'
import { CreateRfqButton } from '@/components/rfq/create-rfq-button'
import { RfqListTable } from '@/components/rfq/rfq-list-table'
import { requireRouteAccess } from '@/lib/require-route-access'
import { listApprovedBomsWithoutRfq } from './boms-without-rfq'

export const metadata: Metadata = { title: 'RFQs' }

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function RfqsPage({ searchParams }: PageProps) {
  const profile = await requireUserProfile()
  requireRouteAccess(profile.role, '/procurement/rfqs')
  const sp = await searchParams
  const statusFilter = sp.status ?? 'all'

  const rows = await db
    .select({
      id: rfqs.id,
      status: rfqs.status,
      line_items: rfqs.line_items,
      created_at: rfqs.created_at,
      bom_id: rfqs.bom_id,
      bom_label: boms.label,
      bom_version: boms.version,
      project_name: projects.name,
      quote_count: sql<number>`(
        SELECT COUNT(*)::int FROM ${rfqQuotes}
        WHERE ${rfqQuotes.rfq_id} = ${rfqs.id}
      )`,
    })
    .from(rfqs)
    .innerJoin(boms, eq(boms.id, rfqs.bom_id))
    .innerJoin(projects, eq(projects.id, boms.project_id))
    .where(eq(rfqs.tenant_id, profile.tenantId))
    .orderBy(desc(rfqs.created_at))
    .limit(200)

  // Approved or locked BOMs that no RFQ was made for, so a buyer can start one by hand.
  const bomsWithoutRfq = can(profile.role, 'rfq.dispatch')
    ? await listApprovedBomsWithoutRfq(profile.tenantId)
    : []

  const filtered =
    statusFilter === 'all' ? rows : rows.filter((r) => r.status === statusFilter)

  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    quotes_received: rows.filter((r) => r.status === 'quotes_received').length,
    completed: rows.filter((r) => r.status === 'completed').length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
  }

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Procurement</p>
        <h1 className="page-title">Requests for Quote</h1>
        <p className="page-subtitle">
          Created when a BOM is approved, or from the list below. Log supplier
          quotes and complete to notify Commercial.
        </p>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <Kpi label="All" value={counts.all.toString()} />
        <Kpi label="Pending" value={counts.pending.toString()} />
        <Kpi label="Quotes in" value={counts.quotes_received.toString()} />
        <Kpi label="Completed" value={counts.completed.toString()} />
        <Kpi label="Cancelled" value={counts.cancelled.toString()} />
      </div>

      {bomsWithoutRfq.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h2 className="card-title">Approved BOMs without an RFQ</h2>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>BOM</th>
                <th>Status</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {bomsWithoutRfq.map((bom) => (
                <tr key={bom.id}>
                  <td>{bom.project_name}</td>
                  <td>{bom.label ?? `BOM v${bom.version}`}</td>
                  <td className="muted">{bom.status}</td>
                  <td style={{ textAlign: 'right' }}>
                    <CreateRfqButton bomId={bom.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RfqListTable
        rows={filtered.map((r) => ({
          id: r.id,
          status: r.status,
          line_count: Array.isArray(r.line_items) ? (r.line_items as unknown[]).length : 0,
          quote_count: r.quote_count ?? 0,
          bom_label: r.bom_label ?? `BOM v${r.bom_version}`,
          project_name: r.project_name,
          created_at: r.created_at.toISOString(),
        }))}
        activeStatus={statusFilter}
      />
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi-card">
      <p className="kpi-card-label">{label}</p>
      <p className="kpi-card-value">{value}</p>
    </div>
  )
}
