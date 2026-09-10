import 'server-only'

import { db } from '@third-code-erp/database'
import {
  cashAllocations,
  invoices,
  permits,
  projects,
} from '@third-code-erp/database/schema'
import {
  buildProjectCloseoutReadinessResult,
  projectCloseoutReadinessQuerySchema,
  type ProjectCloseoutReadinessQuery,
  type ProjectCloseoutReadinessResult,
} from '@third-code-erp/shared-types'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

type BondRow = {
  permitId: string
  permitType: 'performance_bond' | 'surety_bond' | 'construction_bond'
  status: ProjectCloseoutReadinessResult['bonds']['rows'][number]['status']
  expectedReturnAt: Date | null
  actualReturnAt: Date | null
  refundedAt: Date | null
}
type NumericAggregate = { value: number | string | null }

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

export async function readProjectCloseoutReadinessForTenant(
  tenantId: string,
  projectId: string,
  query: ProjectCloseoutReadinessQuery,
  now = new Date(),
): Promise<ProjectCloseoutReadinessResult> {
  projectCloseoutReadinessQuerySchema.parse(query)
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId), isNull(projects.deleted_at)))
    .limit(1)
  if (!project) throw new Error('Project not found')

  const [bondRows, invoiceCountRows, invoiceTotalsRows, retentionRows] = await Promise.all([
    db
      .select({ permitId: permits.id, permitType: permits.permit_type, status: permits.status, expectedReturnAt: permits.expected_return_at, actualReturnAt: permits.actual_return_at, refundedAt: permits.refunded_at })
      .from(permits)
      .where(and(eq(permits.tenant_id, tenantId), eq(permits.project_id, projectId), inArray(permits.permit_type, ['performance_bond', 'surety_bond', 'construction_bond'])))
      .orderBy(desc(permits.updated_at)) as Promise<BondRow[]>,
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(invoices)
      .where(and(eq(invoices.tenant_id, tenantId), eq(invoices.project_id, projectId))) as Promise<NumericAggregate[]>,
    db
      .select({ value: sql<number>`coalesce(sum(${invoices.retention_cents}), 0)::bigint` })
      .from(invoices)
      .where(and(eq(invoices.tenant_id, tenantId), eq(invoices.project_id, projectId))) as Promise<NumericAggregate[]>,
    db
      .select({ value: sql<number>`coalesce(sum(${cashAllocations.amount_cents}), 0)::bigint` })
      .from(cashAllocations)
      .innerJoin(invoices, and(eq(invoices.id, cashAllocations.invoice_id), eq(invoices.tenant_id, cashAllocations.tenant_id), eq(invoices.project_id, projectId)))
      .where(and(eq(cashAllocations.tenant_id, tenantId), eq(cashAllocations.allocation_type, 'customer_retention'))) as Promise<NumericAggregate[]>,
  ])

  return buildProjectCloseoutReadinessResult(projectId, now.toISOString(), {
    bonds: bondRows.map((row) => ({
      permitId: row.permitId,
      permitType: row.permitType,
      status: row.status,
      expectedReturnAt: row.expectedReturnAt?.toISOString() ?? null,
      actualReturnAt: row.actualReturnAt?.toISOString() ?? null,
      refundedAt: row.refundedAt?.toISOString() ?? null,
    })),
    invoiceCount: numberValue(invoiceCountRows[0]?.value),
    retainedCentavos: numberValue(invoiceTotalsRows[0]?.value),
    allocatedCentavos: numberValue(retentionRows[0]?.value),
    pnlCloseoutStatus: 'unavailable',
  })
}
