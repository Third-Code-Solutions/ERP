import { db } from '@third-code-erp/database'
import { purchaseOrders } from '@third-code-erp/database/schema'
import {
  and,
  asc,
  count,
  eq,
  inArray,
  max,
  min,
  sql,
} from 'drizzle-orm'

export const MAX_DUPLICATE_GROUPS = 25
export const MAX_DUPLICATE_RECORDS_PER_GROUP = 100

export interface PurchaseOrderDuplicateRecord {
  id: string
  projectId: string
  status: string
  createdAt: Date | null
}

export interface PurchaseOrderDuplicateGroup {
  poNumber: string
  recordCount: number
  recordsOmitted: number
  firstCreatedAt: Date | null
  lastCreatedAt: Date | null
  projectCount: number
  statusCounts: Record<string, number>
  records: PurchaseOrderDuplicateRecord[]
}

interface DuplicateGroupRow {
  poNumber: string
  recordCount: number
  firstCreatedAt: Date | null
  lastCreatedAt: Date | null
  projectCount: number
}

interface DuplicateRecordRow {
  poNumber: string
  id: string
  projectId: string
  status: string
  createdAt: Date | null
}

function statusCounts(records: readonly PurchaseOrderDuplicateRecord[]) {
  return records.reduce<Record<string, number>>((counts, record) => {
    counts[record.status] = (counts[record.status] ?? 0) + 1
    return counts
  }, {})
}

/**
 * Build an admin review report from already tenant-scoped rows.
 * Pure helper kept separate so the report contract is testable without a
 * database connection and never becomes a mutation path.
 */
export function buildPurchaseOrderDuplicateGroups(
  groups: readonly DuplicateGroupRow[],
  records: readonly DuplicateRecordRow[],
): PurchaseOrderDuplicateGroup[] {
  const byNumber = new Map<string, PurchaseOrderDuplicateRecord[]>()

  for (const record of records) {
    const current = byNumber.get(record.poNumber) ?? []
    if (current.length < MAX_DUPLICATE_RECORDS_PER_GROUP) {
      current.push({
        id: record.id,
        projectId: record.projectId,
        status: record.status,
        createdAt: record.createdAt,
      })
    }
    byNumber.set(record.poNumber, current)
  }

  return groups.map((group) => {
    const reviewRecords = byNumber.get(group.poNumber) ?? []
    return {
      poNumber: group.poNumber,
      recordCount: Number(group.recordCount),
      recordsOmitted: Math.max(0, Number(group.recordCount) - reviewRecords.length),
      firstCreatedAt: group.firstCreatedAt,
      lastCreatedAt: group.lastCreatedAt,
      projectCount: Number(group.projectCount),
      statusCounts: statusCounts(reviewRecords),
      records: reviewRecords,
    }
  })
}

/**
 * Tenant-scoped, read-only report used before the hosted uniqueness migration.
 * It deliberately exposes no write controls and caps the review set.
 */
export async function getPurchaseOrderDuplicateGroups(
  tenantId: string,
): Promise<PurchaseOrderDuplicateGroup[]> {
  const firstCreatedAt = min(purchaseOrders.created_at)
  const lastCreatedAt = max(purchaseOrders.created_at)
  const groupRows = await db
    .select({
      poNumber: purchaseOrders.po_number,
      recordCount: count(),
      firstCreatedAt,
      lastCreatedAt,
      projectCount: sql<number>`count(distinct ${purchaseOrders.project_id})`,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.tenant_id, tenantId))
    .groupBy(purchaseOrders.po_number)
    .having(sql`count(*) > 1`)
    .orderBy(asc(firstCreatedAt), asc(purchaseOrders.po_number))
    .limit(MAX_DUPLICATE_GROUPS)

  if (groupRows.length === 0) return []

  const records = await db
    .select({
      poNumber: purchaseOrders.po_number,
      id: purchaseOrders.id,
      projectId: purchaseOrders.project_id,
      status: sql<string>`${purchaseOrders.status}::text`,
      createdAt: purchaseOrders.created_at,
    })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.tenant_id, tenantId),
        inArray(
          purchaseOrders.po_number,
          groupRows.map((group) => group.poNumber),
        ),
      ),
    )
    .orderBy(asc(purchaseOrders.created_at), asc(purchaseOrders.id))

  return buildPurchaseOrderDuplicateGroups(groupRows, records)
}
