import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { can, requireUserProfile } from '@third-code-erp/auth'
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
  if (!can(profile.role, 'delivery.schedule')) {
    redirect('/procurement/deliveries?error=forbidden')
  }
  const { po: defaultPoId } = await searchParams

  // Restrict to POs that are realistically scheduleable — issued or queued
  // for issuance. Draft / approval-pending POs shouldn't appear because a
  // delivery can't exist before the PO is committed to the supplier.
  const eligibleStatuses = ['issued', 'pending_scm_issuance'] as const
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
