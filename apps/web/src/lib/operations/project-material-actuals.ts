import 'server-only'

import { db } from '@third-code-erp/database'
import {
  materialItems,
  projects,
  purchaseOrders,
  stockMovementLines,
  stockMovements,
  stockReceiptLines,
  stockReceipts,
} from '@third-code-erp/database/schema'
import {
  buildProjectMaterialActualsResult,
  projectMaterialActualsQuerySchema,
  type ProjectMaterialActualAggregate,
  type ProjectMaterialActualsQuery,
  type ProjectMaterialActualsResult,
} from '@third-code-erp/shared-types'
import { and, eq, isNull, sql } from 'drizzle-orm'

type ReceiptAggregateRow = {
  materialItemId: string
  code: string
  description: string
  unit: string
  receivedQuantityMicros: number | string | null
  receivedValueCents: number | string | null
  receiptLineCount: number | string | null
}

type IssueAggregateRow = {
  materialItemId: string
  code: string
  description: string
  unit: string
  issuedQuantityMicros: number | string | null
  issuedValueCents: number | string | null
  issueLineCount: number | string | null
}

type CountRow = { count: number | string | null }

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

export async function readProjectMaterialActualsForTenant(
  tenantId: string,
  projectId: string,
  query: ProjectMaterialActualsQuery,
  now = new Date(),
): Promise<ProjectMaterialActualsResult> {
  projectMaterialActualsQuerySchema.parse(query)

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.tenant_id, tenantId),
        isNull(projects.deleted_at),
      ),
    )
    .limit(1)
  if (!project) throw new Error('Project not found')

  const [receiptRows, issueRows, receiptCountRows, issueCountRows] =
    await Promise.all([
      db
        .select({
          materialItemId: materialItems.id,
          code: materialItems.code,
          description: materialItems.description,
          unit: materialItems.unit,
          receivedQuantityMicros: sql<number>`coalesce(sum(${stockReceiptLines.quantity_micros}), 0)::bigint`,
          receivedValueCents: sql<number>`coalesce(sum(${stockReceiptLines.line_total_cents}), 0)::bigint`,
          receiptLineCount: sql<number>`count(${stockReceiptLines.id})::int`,
        })
        .from(stockReceiptLines)
        .innerJoin(
          stockReceipts,
          and(
            eq(stockReceipts.id, stockReceiptLines.stock_receipt_id),
            eq(stockReceipts.tenant_id, tenantId),
            eq(stockReceipts.status, 'posted'),
          ),
        )
        .innerJoin(
          purchaseOrders,
          and(
            eq(purchaseOrders.id, stockReceipts.purchase_order_id),
            eq(purchaseOrders.tenant_id, tenantId),
            eq(purchaseOrders.project_id, projectId),
          ),
        )
        .innerJoin(
          materialItems,
          and(
            eq(materialItems.id, stockReceiptLines.material_item_id),
            eq(materialItems.tenant_id, tenantId),
          ),
        )
        .where(eq(stockReceiptLines.tenant_id, tenantId))
        .groupBy(
          materialItems.id,
          materialItems.code,
          materialItems.description,
          materialItems.unit,
        ) as Promise<ReceiptAggregateRow[]>,
      db
        .select({
          materialItemId: materialItems.id,
          code: materialItems.code,
          description: materialItems.description,
          unit: materialItems.unit,
          issuedQuantityMicros: sql<number>`coalesce(sum(abs(${stockMovementLines.quantity_micros})), 0)::bigint`,
          issuedValueCents: sql<number>`coalesce(sum(${stockMovementLines.posted_value_cents}), 0)::bigint`,
          issueLineCount: sql<number>`count(${stockMovementLines.id})::int`,
        })
        .from(stockMovementLines)
        .innerJoin(
          stockMovements,
          and(
            eq(stockMovements.id, stockMovementLines.stock_movement_id),
            eq(stockMovements.tenant_id, tenantId),
            eq(stockMovements.project_id, projectId),
            eq(stockMovements.movement_type, 'consumption'),
            eq(stockMovements.status, 'posted'),
          ),
        )
        .innerJoin(
          materialItems,
          and(
            eq(materialItems.id, stockMovementLines.material_item_id),
            eq(materialItems.tenant_id, tenantId),
          ),
        )
        .where(eq(stockMovementLines.tenant_id, tenantId))
        .groupBy(
          materialItems.id,
          materialItems.code,
          materialItems.description,
          materialItems.unit,
        ) as Promise<IssueAggregateRow[]>,
      db
        .select({
          count: sql<number>`count(distinct ${stockReceipts.id})::int`,
        })
        .from(stockReceipts)
        .innerJoin(
          purchaseOrders,
          and(
            eq(purchaseOrders.id, stockReceipts.purchase_order_id),
            eq(purchaseOrders.tenant_id, tenantId),
            eq(purchaseOrders.project_id, projectId),
          ),
        )
        .where(
          and(
            eq(stockReceipts.tenant_id, tenantId),
            eq(stockReceipts.status, 'posted'),
          ),
        ) as Promise<CountRow[]>,
      db
        .select({
          count: sql<number>`count(distinct ${stockMovements.id})::int`,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.tenant_id, tenantId),
            eq(stockMovements.project_id, projectId),
            eq(stockMovements.movement_type, 'consumption'),
            eq(stockMovements.status, 'posted'),
          ),
        ) as Promise<CountRow[]>,
    ])

  const aggregates = new Map<string, ProjectMaterialActualAggregate>()
  const ensure = (
    materialItemId: string,
    code: string,
    description: string,
    unit: string,
  ): ProjectMaterialActualAggregate => {
    const existing = aggregates.get(materialItemId)
    if (existing) return existing
    const created: ProjectMaterialActualAggregate = {
      materialItemId,
      code,
      description,
      unit,
      receivedQuantityMicros: 0,
      issuedQuantityMicros: 0,
      receivedValueCents: 0,
      issuedValueCents: 0,
      receiptLineCount: 0,
      issueLineCount: 0,
    }
    aggregates.set(materialItemId, created)
    return created
  }

  for (const row of receiptRows) {
    const aggregate = ensure(row.materialItemId, row.code, row.description, row.unit)
    aggregate.receivedQuantityMicros = numberValue(row.receivedQuantityMicros)
    aggregate.receivedValueCents = numberValue(row.receivedValueCents)
    aggregate.receiptLineCount = numberValue(row.receiptLineCount)
  }
  for (const row of issueRows) {
    const aggregate = ensure(row.materialItemId, row.code, row.description, row.unit)
    aggregate.issuedQuantityMicros = numberValue(row.issuedQuantityMicros)
    aggregate.issuedValueCents = numberValue(row.issuedValueCents)
    aggregate.issueLineCount = numberValue(row.issueLineCount)
  }

  return buildProjectMaterialActualsResult(
    projectId,
    now.toISOString(),
    [...aggregates.values()],
    {
      receiptCount: numberValue(receiptCountRows[0]?.count),
      issueCount: numberValue(issueCountRows[0]?.count),
    },
  )
}
