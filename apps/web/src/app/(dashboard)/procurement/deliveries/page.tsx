import type { Metadata } from 'next'
import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  deliverySchedules,
  purchaseOrders,
  vendors,
} from '@third-code-erp/database/schema'
import { DeliveryListTable } from '@/components/deliveries/delivery-list-table'

export const metadata: Metadata = { title: 'Deliveries' }

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'site_preparing', label: 'Site preparing' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'received', label: 'Received' },
  { value: 'inspecting', label: 'Inspecting' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
] as const

type FilterValue = (typeof STATUS_FILTERS)[number]['value']

interface SearchParams {
  status?: string
}

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const profile = await requireUserProfile()
  const { status: rawStatus } = await searchParams
  const activeStatus = (
    STATUS_FILTERS.some((f) => f.value === rawStatus) ? rawStatus : 'all'
  ) as FilterValue

  const baseWhere = eq(deliverySchedules.tenant_id, profile.tenantId)

  const rows = await db
    .select({
      id: deliverySchedules.id,
      status: deliverySchedules.status,
      scheduled_date: deliverySchedules.scheduled_date,
      site_address: deliverySchedules.site_address,
      accepted_at: deliverySchedules.accepted_at,
      created_at: deliverySchedules.created_at,
      purchase_order_id: deliverySchedules.purchase_order_id,
      po_number: purchaseOrders.po_number,
      vendor_name: vendors.name,
    })
    .from(deliverySchedules)
    .leftJoin(
      purchaseOrders,
      and(
        eq(purchaseOrders.id, deliverySchedules.purchase_order_id),
        eq(purchaseOrders.tenant_id, deliverySchedules.tenant_id)
      )
    )
    .leftJoin(
      vendors,
      and(
        eq(vendors.id, purchaseOrders.vendor_id),
        eq(vendors.tenant_id, deliverySchedules.tenant_id)
      )
    )
    .where(baseWhere)
    .orderBy(desc(deliverySchedules.scheduled_date), desc(deliverySchedules.created_at))
    .limit(300)

  // KPIs computed over the full result (cheap; capped at 300 rows above).
  const scheduledCount = rows.filter((r) => r.status === 'scheduled').length
  const inTransitCount = rows.filter((r) => r.status === 'in_transit').length
  const awaitingInspectionCount = rows.filter((r) => r.status === 'received').length

  const weekAgo = Date.now() - 7 * 86400000
  const acceptedThisWeek = rows.filter(
    (r) => r.accepted_at && new Date(r.accepted_at).getTime() >= weekAgo
  ).length

  const visibleRows =
    activeStatus === 'all' ? rows : rows.filter((r) => r.status === activeStatus)

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div className="page-header" style={{ marginBottom: 0 }}>
          <p className="page-eyebrow">Procurement</p>
          <h1 className="page-title">Deliveries</h1>
          <p className="page-subtitle">
            Schedule, receive, and inspect supplier deliveries.
          </p>
        </div>
        <Link
          href="/procurement/deliveries/new"
          style={{
            background: 'var(--color-navy-700)',
            color: 'white',
            padding: '10px 18px',
            borderRadius: 6,
            fontSize: '0.875rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          + Schedule delivery
        </Link>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 20 }}>
        <Kpi label="Scheduled" value={scheduledCount.toString()} />
        <Kpi label="In transit" value={inTransitCount.toString()} />
        <Kpi
          label="Received (awaiting inspection)"
          value={awaitingInspectionCount.toString()}
        />
        <Kpi label="Accepted this week" value={acceptedThisWeek.toString()} />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          margin: '20px 0 12px',
        }}
      >
        {STATUS_FILTERS.map((f) => {
          const isActive = activeStatus === f.value
          const href =
            f.value === 'all'
              ? '/procurement/deliveries'
              : `/procurement/deliveries?status=${f.value}`
          return (
            <Link
              key={f.value}
              href={href}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: '0.8125rem',
                fontWeight: 500,
                textDecoration: 'none',
                border: '1px solid var(--color-border)',
                background: isActive ? 'var(--color-navy-700)' : 'white',
                color: isActive ? 'white' : 'var(--color-neutral-700)',
              }}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            {visibleRows.length} delivery{visibleRows.length === 1 ? '' : 'ies'}
          </h2>
        </div>
        {visibleRows.length === 0 ? (
          <div className="card-empty">
            {rows.length === 0
              ? 'No deliveries scheduled yet. Schedule one to begin tracking site prep, receipt, and inspection.'
              : 'No deliveries match this filter.'}
          </div>
        ) : (
          <DeliveryListTable
            rows={visibleRows.map((r) => ({
              id: r.id,
              status: r.status,
              scheduled_date: r.scheduled_date ? r.scheduled_date.toISOString() : null,
              po_number: r.po_number,
              vendor_name: r.vendor_name,
            }))}
          />
        )}
      </div>
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
