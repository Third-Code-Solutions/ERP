import Link from 'next/link'
import type { Metadata } from 'next'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  purchaseOrders,
  vendors,
  projects,
} from '@third-code-erp/database/schema'
import { ScheduleDeliveryForm } from '@/components/deliveries/schedule-delivery-form'

export const metadata: Metadata = { title: 'Schedule delivery' }

interface SearchParams {
  po?: string
}

export default async function NewDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const profile = await requireUserProfile()
  const { po: defaultPoId } = await searchParams

  // Match Core's scheduling guard: approval-pending POs cannot be delivered.
  const eligibleStatuses = ['issued'] as const
  const poRows = await db
    .select({
      id: purchaseOrders.id,
      po_number: purchaseOrders.po_number,
      status: purchaseOrders.status,
      vendor_name: vendors.name,
      project_name: projects.name,
    })
    .from(purchaseOrders)
    .leftJoin(vendors, eq(vendors.id, purchaseOrders.vendor_id))
    .leftJoin(projects, eq(projects.id, purchaseOrders.project_id))
    .where(
      and(
        eq(purchaseOrders.tenant_id, profile.tenantId),
        inArray(purchaseOrders.status, [...eligibleStatuses])
      )
    )
    .orderBy(desc(purchaseOrders.created_at))
    .limit(200)

  const poOptions = poRows.map((r) => ({
    id: r.id,
    label: `${r.po_number} · ${r.vendor_name ?? 'No vendor'} · ${r.project_name ?? 'No project'}`,
  }))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Link
          href="/procurement/deliveries"
          style={{
            color: 'var(--color-neutral-400)',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          Deliveries
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>
          Schedule
        </span>
      </div>

      <div className="page-header">
        <p className="page-eyebrow">Procurement</p>
        <h1 className="page-title">Schedule delivery</h1>
        <p className="page-subtitle">
          Pick the issued PO and capture site access details so the receiving
          team knows where to direct the truck.
        </p>
      </div>

      <ScheduleDeliveryForm
        purchaseOrders={poOptions}
        defaultPurchaseOrderId={defaultPoId}
      />
    </div>
  )
}
