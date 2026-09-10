import 'server-only'

import {
  buildVendorPerformanceResult,
  type VendorPerformanceAggregate,
  type VendorPerformanceQuery,
  type VendorPerformanceResult,
} from '@third-code-erp/shared-types'
import { db } from '@third-code-erp/database'
import {
  deliverySchedules,
  purchaseOrders,
  supplierBills,
  vendors,
} from '@third-code-erp/database/schema'
import { and, eq, isNotNull, sql } from 'drizzle-orm'

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function readVendorPerformanceForTenant(
  tenantId: string,
  query: VendorPerformanceQuery,
  now = new Date(),
): Promise<VendorPerformanceResult> {
  const vendorRows = await db
    .select({ vendorId: vendors.id, vendorName: vendors.name })
    .from(vendors)
    .where(eq(vendors.tenant_id, tenantId))
    .orderBy(vendors.name)

  const projectFilter = query.projectId
    ? eq(purchaseOrders.project_id, query.projectId)
    : undefined
  const poRows = (await db
    .select({
      vendorId: purchaseOrders.vendor_id,
      vendorName: vendors.name,
      poCount: sql<number>`count(*)::int`,
      issuedPoCount: sql<number>`count(*) filter (where ${purchaseOrders.status} in ('issued', 'partial_delivered', 'fully_delivered', 'delivered'))::int`,
      openPoCount: sql<number>`count(*) filter (where ${purchaseOrders.status} not in ('cancelled', 'fully_delivered', 'delivered'))::int`,
      committedCents: sql<number>`coalesce(sum(${purchaseOrders.total_cents}), 0)::bigint`,
    })
    .from(purchaseOrders)
    .innerJoin(vendors, and(eq(vendors.id, purchaseOrders.vendor_id), eq(vendors.tenant_id, tenantId)))
    .where(and(eq(purchaseOrders.tenant_id, tenantId), isNotNull(purchaseOrders.vendor_id), projectFilter))
    .groupBy(purchaseOrders.vendor_id, vendors.name))
    .flatMap((row) => row.vendorId ? [{ ...row, vendorId: row.vendorId }] : [])

  const deliveryRows = (await db
    .select({
      vendorId: purchaseOrders.vendor_id,
      deliveryCount: sql<number>`count(*) filter (where ${deliverySchedules.status} <> 'cancelled')::int`,
      acceptedDeliveryCount: sql<number>`count(*) filter (where ${deliverySchedules.status} = 'accepted')::int`,
      rejectedDeliveryCount: sql<number>`count(*) filter (where ${deliverySchedules.status} = 'rejected')::int`,
      onTimeDeliveryCount: sql<number>`count(*) filter (where ${deliverySchedules.status} in ('received', 'inspecting', 'accepted') and ${purchaseOrders.delivery_date} is not null and coalesce(${deliverySchedules.accepted_at}, ${deliverySchedules.received_at}) is not null and coalesce(${deliverySchedules.accepted_at}, ${deliverySchedules.received_at}) <= ${purchaseOrders.delivery_date})::int`,
      averageLeadTimeDays: sql<number>`avg(extract(epoch from (coalesce(${deliverySchedules.accepted_at}, ${deliverySchedules.received_at}) - ${purchaseOrders.created_at})) / 86400) filter (where ${deliverySchedules.status} <> 'cancelled' and coalesce(${deliverySchedules.accepted_at}, ${deliverySchedules.received_at}) is not null)`,
    })
    .from(deliverySchedules)
    .innerJoin(purchaseOrders, and(eq(purchaseOrders.id, deliverySchedules.purchase_order_id), eq(purchaseOrders.tenant_id, tenantId)))
    .where(and(eq(deliverySchedules.tenant_id, tenantId), isNotNull(purchaseOrders.vendor_id), projectFilter))
    .groupBy(purchaseOrders.vendor_id))
    .flatMap((row) => row.vendorId ? [{ ...row, vendorId: row.vendorId }] : [])

  const billRows = await db
    .select({
      vendorId: supplierBills.vendor_id,
      supplierBillCount: sql<number>`count(*)::int`,
      postedBillCount: sql<number>`count(*) filter (where ${supplierBills.status} = 'posted')::int`,
      postedSpendCents: sql<number>`coalesce(sum(${supplierBills.subtotal_cents}) filter (where ${supplierBills.status} = 'posted'), 0)::bigint`,
    })
    .from(supplierBills)
    .where(and(eq(supplierBills.tenant_id, tenantId), query.projectId ? eq(supplierBills.project_id, query.projectId) : undefined))
    .groupBy(supplierBills.vendor_id)

  const scopedVendorIds = new Set<string>([
    ...poRows.map((row) => row.vendorId),
    ...deliveryRows.map((row) => row.vendorId),
    ...billRows.map((row) => row.vendorId),
  ])
  const aggregates = new Map<string, VendorPerformanceAggregate>()
  const ensure = (vendorId: string, vendorName?: string): VendorPerformanceAggregate => {
    const existing = aggregates.get(vendorId)
    if (existing) return existing
    const created: VendorPerformanceAggregate = {
      vendorId,
      vendorName: vendorName ?? vendorRows.find((row) => row.vendorId === vendorId)?.vendorName ?? 'Unknown vendor',
      poCount: 0,
      issuedPoCount: 0,
      openPoCount: 0,
      committedCents: 0,
      deliveryCount: 0,
      acceptedDeliveryCount: 0,
      rejectedDeliveryCount: 0,
      onTimeDeliveryCount: 0,
      averageLeadTimeDays: null,
      supplierBillCount: 0,
      postedBillCount: 0,
      postedSpendCents: 0,
    }
    aggregates.set(vendorId, created)
    return created
  }

  for (const vendor of vendorRows) {
    if (!query.projectId || scopedVendorIds.has(vendor.vendorId)) ensure(vendor.vendorId, vendor.vendorName)
  }
  for (const row of poRows) {
    const aggregate = ensure(row.vendorId, row.vendorName)
    aggregate.poCount = Math.trunc(numberValue(row.poCount))
    aggregate.issuedPoCount = Math.trunc(numberValue(row.issuedPoCount))
    aggregate.openPoCount = Math.trunc(numberValue(row.openPoCount))
    aggregate.committedCents = Math.trunc(numberValue(row.committedCents))
  }
  for (const row of deliveryRows) {
    const aggregate = ensure(row.vendorId)
    aggregate.deliveryCount = Math.trunc(numberValue(row.deliveryCount))
    aggregate.acceptedDeliveryCount = Math.trunc(numberValue(row.acceptedDeliveryCount))
    aggregate.rejectedDeliveryCount = Math.trunc(numberValue(row.rejectedDeliveryCount))
    aggregate.onTimeDeliveryCount = Math.trunc(numberValue(row.onTimeDeliveryCount))
    aggregate.averageLeadTimeDays = row.averageLeadTimeDays === null ? null : numberValue(row.averageLeadTimeDays)
  }
  for (const row of billRows) {
    const aggregate = ensure(row.vendorId)
    aggregate.supplierBillCount = Math.trunc(numberValue(row.supplierBillCount))
    aggregate.postedBillCount = Math.trunc(numberValue(row.postedBillCount))
    aggregate.postedSpendCents = Math.trunc(numberValue(row.postedSpendCents))
  }

  return buildVendorPerformanceResult(now.toISOString(), query.projectId ?? null, [...aggregates.values()])
}
