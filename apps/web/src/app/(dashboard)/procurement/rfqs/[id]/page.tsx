/**
 * RFQ detail (REFACTOR.md M3 US-013).
 *
 * Three surfaces:
 *   1. Line items captured at RFQ creation (from BOM, minus contracted-rate
 *      lines). Each line opens an inline form to log a supplier quote.
 *   2. Price comparison built from received rfq_quotes — one row per line,
 *      one column per quoting vendor, lowest price highlighted.
 *   3. Action row: Complete RFQ (gated on quote coverage), Cancel RFQ.
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { and, eq } from 'drizzle-orm'
import { requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  rfqs,
  rfqQuotes,
  boms,
  projects,
  vendors,
  materialItems,
  priceHistory,
} from '@third-code-erp/database/schema'
import { LogQuoteForm } from '@/components/rfq/log-quote-form'
import { PriceComparisonTable } from '@/components/rfq/price-comparison-table'
import { completeRfq, cancelRfq } from '../actions'

export const metadata: Metadata = { title: 'RFQ Detail' }

const STATUS_BADGE: Record<string, string> = {
  pending: 'stage-badge stage-opportunity_creation',
  quotes_received: 'stage-badge stage-bom_submission',
  completed: 'stage-badge stage-closed_won',
  cancelled: 'stage-badge stage-closed_lost',
}

interface RfqLineItemJson {
  bom_line_item_id?: string
  material_item_id: string | null
  code: string | null
  description: string
  qty: number
  unit: string | null
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function RfqDetailPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireUserProfile()

  const [rfq] = await db
    .select({
      id: rfqs.id,
      status: rfqs.status,
      line_items: rfqs.line_items,
      created_at: rfqs.created_at,
      bom_id: rfqs.bom_id,
      bom_label: boms.label,
      bom_version: boms.version,
      project_id: boms.project_id,
      project_name: projects.name,
    })
    .from(rfqs)
    .innerJoin(
      boms,
      and(
        eq(boms.id, rfqs.bom_id),
        eq(boms.tenant_id, profile.tenantId)
      )
    )
    .innerJoin(
      projects,
      and(
        eq(projects.id, boms.project_id),
        eq(projects.tenant_id, profile.tenantId)
      )
    )
    .where(and(eq(rfqs.id, id), eq(rfqs.tenant_id, profile.tenantId)))
    .limit(1)

  if (!rfq) notFound()

  const quotes = await db
    .select({
      id: rfqQuotes.id,
      bom_line_item_id: rfqQuotes.bom_line_item_id,
      vendor_id: rfqQuotes.vendor_id,
      vendor_name: vendors.name,
      material_item_id: rfqQuotes.material_item_id,
      material_code: materialItems.code,
      unit_price_cents: rfqQuotes.unit_price_cents,
      lead_time_days: rfqQuotes.lead_time_days,
      valid_until: rfqQuotes.valid_until,
      notes: rfqQuotes.notes,
      created_at: rfqQuotes.created_at,
    })
    .from(rfqQuotes)
    .innerJoin(
      vendors,
      and(
        eq(vendors.id, rfqQuotes.vendor_id),
        eq(vendors.tenant_id, profile.tenantId)
      )
    )
    .leftJoin(
      materialItems,
      and(
        eq(materialItems.id, rfqQuotes.material_item_id),
        eq(materialItems.tenant_id, profile.tenantId)
      )
    )
    .where(
      and(
        eq(rfqQuotes.rfq_id, id),
        eq(rfqQuotes.tenant_id, profile.tenantId)
      )
    )

  const [awards, vendorList] = await Promise.all([
    db
      .select({ quoteId: priceHistory.source_rfq_quote_id })
      .from(priceHistory)
      .where(
        and(
          eq(priceHistory.tenant_id, profile.tenantId),
          eq(priceHistory.source_rfq_id, id),
          eq(priceHistory.source_type, 'award'),
        ),
      ),
    db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(eq(vendors.tenant_id, profile.tenantId))
    .orderBy(vendors.name)
  ])

  const awardedQuoteIds = new Set(
    awards.flatMap((award) => award.quoteId ? [award.quoteId] : []),
  )

  const lineItems = Array.isArray(rfq.line_items)
    ? (rfq.line_items as RfqLineItemJson[])
    : []

  // A line is "covered" if at least one quote references it. We match by
  // material_item_id when present, else fall back to code-string match via
  // materialItems join (which gives us material_code on the quote row).
  const coveredKeys = new Set<string>()
  for (const q of quotes) {
    if (q.bom_line_item_id) {
      coveredKeys.add(`line:${q.bom_line_item_id}`)
    }
    if (q.material_item_id) coveredKeys.add(`mi:${q.material_item_id}`)
    if (q.material_code) coveredKeys.add(`code:${q.material_code}`)
  }
  const allLinesCovered =
    lineItems.length > 0 &&
    lineItems.every((l) => {
      if (
        l.bom_line_item_id &&
        coveredKeys.has(`line:${l.bom_line_item_id}`)
      ) {
        return true
      }
      if (l.material_item_id && coveredKeys.has(`mi:${l.material_item_id}`)) return true
      if (l.code && coveredKeys.has(`code:${l.code}`)) return true
      return false
    })

  const canManage = can(profile.role, 'rfq.dispatch')
  const isTerminal = rfq.status === 'completed' || rfq.status === 'cancelled'

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href="/procurement/rfqs" style={{ color: 'inherit' }}>
            ← Back to RFQs
          </Link>
        </p>
        <h1 className="page-title">
          {rfq.bom_label ?? `BOM v${rfq.bom_version}`}{' '}
          <span className={STATUS_BADGE[rfq.status] ?? 'stage-badge'}>
            <span className="stage-badge-dot" />
            {rfq.status.replace('_', ' ')}
          </span>
        </h1>
        <p className="page-subtitle">
          {rfq.project_name} · {lineItems.length} item
          {lineItems.length === 1 ? '' : 's'} · {quotes.length} quote
          {quotes.length === 1 ? '' : 's'} received
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 320px',
          gap: 20,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Line items + log quote */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Line items</h2>
            </div>
            {lineItems.length === 0 ? (
              <div className="card-empty">No line items on this RFQ.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th>Unit</th>
                    <th>Quotes</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((l, idx) => {
                    const matchedQuotes = quotes.filter((q) =>
                      (l.bom_line_item_id &&
                        q.bom_line_item_id === l.bom_line_item_id) ||
                      (l.material_item_id &&
                        q.material_item_id === l.material_item_id) ||
                      (l.code && q.material_code === l.code)
                    )
                    return (
                      <tr key={idx}>
                        <td className="muted" style={{ fontFamily: 'var(--font-mono)' }}>
                          {l.code ?? '—'}
                        </td>
                        <td>{l.description}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {l.qty.toLocaleString('en-PH')}
                        </td>
                        <td className="muted">{l.unit ?? '—'}</td>
                        <td>
                          {matchedQuotes.length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            <strong>{matchedQuotes.length}</strong>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Quote logger */}
          {canManage && !isTerminal && (
            <LogQuoteForm
              rfqId={rfq.id}
              vendors={vendorList}
              lineItems={lineItems.map((l) => ({
                bom_line_item_id: l.bom_line_item_id,
                material_item_id: l.material_item_id,
                code: l.code,
                description: l.description,
              }))}
            />
          )}

          {/* Price comparison */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Price comparison</h2>
            </div>
            {quotes.length === 0 ? (
              <div className="card-empty">
                No quotes received yet. Log the first supplier quote above.
              </div>
            ) : (
              <PriceComparisonTable
                rfqId={rfq.id}
                canAward={canManage && rfq.status === 'completed'}
                lineItems={lineItems.map((l) => ({
                  bom_line_item_id: l.bom_line_item_id,
                  material_item_id: l.material_item_id,
                  code: l.code,
                  description: l.description,
                  unit: l.unit,
                  qty: l.qty,
                }))}
                quotes={quotes.map((q) => ({
                  id: q.id,
                  vendor_id: q.vendor_id,
                  vendor_name: q.vendor_name,
                  bom_line_item_id: q.bom_line_item_id,
                  material_item_id: q.material_item_id,
                  material_code: q.material_code,
                  unit_price_cents: q.unit_price_cents,
                  lead_time_days: q.lead_time_days,
                  is_awarded: awardedQuoteIds.has(q.id),
                }))}
              />
            )}
          </div>
        </div>

        {/* Actions sidebar */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {canManage && !isTerminal && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Actions</h2>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <CompleteRfqButton
                  rfqId={rfq.id}
                  enabled={allLinesCovered}
                />
                <CancelRfqForm rfqId={rfq.id} />
                {!allLinesCovered && (
                  <p style={{ fontSize: 11.5, color: 'var(--color-neutral-600)', margin: 0 }}>
                    Complete unlocks once every line has at least one quote.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Summary</h2>
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 10, fontSize: 13 }}>
              <Row label="Created" value={new Date(rfq.created_at).toLocaleString('en-PH')} />
              <Row label="Project" value={rfq.project_name} />
              <Row label="Line items" value={lineItems.length.toString()} />
              <Row label="Quotes" value={quotes.length.toString()} />
              <Row label="Status" value={rfq.status.replace('_', ' ')} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ color: 'var(--color-neutral-600)' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function CompleteRfqButton({ rfqId, enabled }: { rfqId: string; enabled: boolean }) {
  // Plain server-action form — no JS needed.
  const action = async () => {
    'use server'
    await completeRfq(rfqId)
  }
  return (
    <form action={action}>
      <button
        type="submit"
        disabled={!enabled}
        style={{
          background: enabled ? '#0F2D4A' : '#cbd5e1',
          color: 'white',
          border: 'none',
          padding: '9px 14px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          cursor: enabled ? 'pointer' : 'not-allowed',
          width: '100%',
        }}
      >
        Complete RFQ
      </button>
    </form>
  )
}

function CancelRfqForm({ rfqId }: { rfqId: string }) {
  const action = async (formData: FormData) => {
    'use server'
    const reason = String(formData.get('reason') ?? '')
    await cancelRfq(rfqId, reason)
  }
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        name="reason"
        placeholder="Cancellation reason"
        required
        style={{
          width: '100%',
          border: '1px solid #d0d5dd',
          borderRadius: 6,
          padding: '7px 10px',
          fontSize: 13,
          background: 'white',
        }}
      />
      <button
        type="submit"
        style={{
          background: 'white',
          border: '1px solid #d0d5dd',
          padding: '8px 14px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          color: '#b42318',
        }}
      >
        Cancel RFQ
      </button>
    </form>
  )
}
