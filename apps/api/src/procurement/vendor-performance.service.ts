import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  deliverySchedules,
  projects,
  purchaseOrders,
  supplierBills,
  users,
  vendors,
} from '@third-code-erp/database/schema'
import {
  buildVendorPerformanceResult,
  vendorPerformanceQuerySchema,
  type VendorPerformanceAggregate,
  type VendorPerformanceQuery,
  type VendorPerformanceResult,
} from '@third-code-erp/shared-types'
import { ERP_ROLES, roleHasCapability, type ErpCapability } from '@third-code-erp/shared-types/authorization'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

type VendorAggregateRow = {
  vendorId: string
  vendorName: string
  poCount: number | string | null
  issuedPoCount: number | string | null
  openPoCount: number | string | null
  committedCents: number | string | null
}

type DeliveryAggregateRow = {
  vendorId: string
  deliveryCount: number | string | null
  acceptedDeliveryCount: number | string | null
  rejectedDeliveryCount: number | string | null
  onTimeDeliveryCount: number | string | null
  averageLeadTimeDays: number | string | null
}

type BillAggregateRow = {
  vendorId: string
  supplierBillCount: number | string | null
  postedBillCount: number | string | null
  postedSpendCents: number | string | null
}

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function projectFilter(
  projectId: string | undefined,
): ReturnType<typeof eq> | undefined {
  return projectId ? eq(purchaseOrders.project_id, projectId) : undefined
}

@Injectable()
export class VendorPerformanceService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async read(
    query: VendorPerformanceQuery,
    principal: ErpPrincipal,
    now = new Date(),
  ): Promise<VendorPerformanceResult> {
    const input = vendorPerformanceQuerySchema.parse(query)
    await this.requireMembership(principal, 'procurement.vendor_performance.read')

    if (input.projectId) {
      const [project] = await this.database.client
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.tenant_id, principal.tenantId),
            isNull(projects.deleted_at),
          ),
        )
        .limit(1)
      if (!project) throw new NotFoundException('Project not found')
    }

    const vendorRows = await this.database.client
      .select({ vendorId: vendors.id, vendorName: vendors.name })
      .from(vendors)
      .where(eq(vendors.tenant_id, principal.tenantId))
      .orderBy(vendors.name)

    const poRows = (await this.database.client
      .select({
        vendorId: purchaseOrders.vendor_id,
        vendorName: vendors.name,
        poCount: sql<number>`count(*)::int`,
        issuedPoCount: sql<number>`count(*) filter (where ${purchaseOrders.status} in ('issued', 'partial_delivered', 'fully_delivered', 'delivered'))::int`,
        openPoCount: sql<number>`count(*) filter (where ${purchaseOrders.status} not in ('cancelled', 'fully_delivered', 'delivered'))::int`,
        committedCents: sql<number>`coalesce(sum(${purchaseOrders.total_cents}), 0)::bigint`,
      })
      .from(purchaseOrders)
      .innerJoin(
        vendors,
        and(
          eq(vendors.id, purchaseOrders.vendor_id),
          eq(vendors.tenant_id, principal.tenantId),
        ),
      )
      .where(
        and(
          eq(purchaseOrders.tenant_id, principal.tenantId),
          isNotNull(purchaseOrders.vendor_id),
          projectFilter(input.projectId),
        ),
      )
      .groupBy(purchaseOrders.vendor_id, vendors.name)) as VendorAggregateRow[]

    const deliveryRows = (await this.database.client
      .select({
        vendorId: purchaseOrders.vendor_id,
        deliveryCount: sql<number>`count(*) filter (where ${deliverySchedules.status} <> 'cancelled')::int`,
        acceptedDeliveryCount: sql<number>`count(*) filter (where ${deliverySchedules.status} = 'accepted')::int`,
        rejectedDeliveryCount: sql<number>`count(*) filter (where ${deliverySchedules.status} = 'rejected')::int`,
        onTimeDeliveryCount: sql<number>`count(*) filter (where ${deliverySchedules.status} in ('received', 'inspecting', 'accepted') and ${purchaseOrders.delivery_date} is not null and coalesce(${deliverySchedules.accepted_at}, ${deliverySchedules.received_at}) is not null and coalesce(${deliverySchedules.accepted_at}, ${deliverySchedules.received_at}) <= ${purchaseOrders.delivery_date})::int`,
        averageLeadTimeDays: sql<number>`avg(extract(epoch from (coalesce(${deliverySchedules.accepted_at}, ${deliverySchedules.received_at}) - ${purchaseOrders.created_at})) / 86400) filter (where ${deliverySchedules.status} <> 'cancelled' and coalesce(${deliverySchedules.accepted_at}, ${deliverySchedules.received_at}) is not null)`,
      })
      .from(deliverySchedules)
      .innerJoin(
        purchaseOrders,
        and(
          eq(purchaseOrders.id, deliverySchedules.purchase_order_id),
          eq(purchaseOrders.tenant_id, principal.tenantId),
        ),
      )
      .where(
        and(
          eq(deliverySchedules.tenant_id, principal.tenantId),
          isNotNull(purchaseOrders.vendor_id),
          projectFilter(input.projectId),
        ),
      )
      .groupBy(purchaseOrders.vendor_id)) as DeliveryAggregateRow[]

    const billRows = (await this.database.client
      .select({
        vendorId: supplierBills.vendor_id,
        supplierBillCount: sql<number>`count(*)::int`,
        postedBillCount: sql<number>`count(*) filter (where ${supplierBills.status} = 'posted')::int`,
        postedSpendCents: sql<number>`coalesce(sum(${supplierBills.subtotal_cents}) filter (where ${supplierBills.status} = 'posted'), 0)::bigint`,
      })
      .from(supplierBills)
      .where(
        and(
          eq(supplierBills.tenant_id, principal.tenantId),
          input.projectId
            ? eq(supplierBills.project_id, input.projectId)
            : undefined,
        ),
      )
      .groupBy(supplierBills.vendor_id)) as BillAggregateRow[]

    const scopedVendorIds = new Set<string>([
      ...poRows.map((row) => row.vendorId),
      ...deliveryRows.map((row) => row.vendorId),
      ...billRows.map((row) => row.vendorId),
    ])
    const names = new Map(
      vendorRows
        .filter((row) => !input.projectId || scopedVendorIds.has(row.vendorId))
        .map((row) => [row.vendorId, row.vendorName]),
    )
    const aggregates = new Map<string, VendorPerformanceAggregate>()
    const ensure = (vendorId: string, vendorName?: string): VendorPerformanceAggregate => {
      const existing = aggregates.get(vendorId)
      if (existing) return existing
      const created: VendorPerformanceAggregate = {
        vendorId,
        vendorName: vendorName ?? names.get(vendorId) ?? 'Unknown vendor',
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

    if (input.projectId) {
      for (const row of names) ensure(row[0], row[1])
    } else {
      for (const row of vendorRows) ensure(row.vendorId, row.vendorName)
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
      aggregate.averageLeadTimeDays = row.averageLeadTimeDays === null
        ? null
        : numberValue(row.averageLeadTimeDays)
    }
    for (const row of billRows) {
      const aggregate = ensure(row.vendorId)
      aggregate.supplierBillCount = Math.trunc(numberValue(row.supplierBillCount))
      aggregate.postedBillCount = Math.trunc(numberValue(row.postedBillCount))
      aggregate.postedSpendCents = Math.trunc(numberValue(row.postedSpendCents))
    }

    return buildVendorPerformanceResult(
      now.toISOString(),
      input.projectId ?? null,
      [...aggregates.values()],
    )
  }

  private async requireMembership(
    principal: ErpPrincipal,
    capability: ErpCapability,
  ): Promise<void> {
    const [membership] = await this.database.client
      .select({ tenantId: users.tenant_id, role: users.role, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.tenant_id, principal.tenantId),
        ),
      )
      .limit(1)
    const role = z.enum(ERP_ROLES).safeParse(membership?.role)
    if (!role.success || !roleHasCapability(role.data, capability)) {
      throw new ForbiddenException()
    }
  }
}
