import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import {
  boms,
  bomLineItems,
  materialItems,
  rateCards,
  rfqs,
  users,
} from '@third-code-erp/database/schema'
import { writeAuditLogInTransaction } from '@/lib/audit'
import { notifyRoles } from '@/lib/operations/notifications'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface RfqLineItemJson {
  material_item_id: string | null
  code: string | null
  description: string
  qty: number
  unit: string | null
}

export type RfqCreationSource =
  | 'manual'
  | 'bom_approved_event'
  | 'bom_internal_approved_event'

export interface CreateRfqFromBomParams {
  bomId: string
  tenantId: string
  actorId: string | null
  source: RfqCreationSource
}

export interface CreatedRfq {
  rfqId: string
  tenantId: string
  projectId: string
  lineCount: number
  created: boolean
}

export type CreateRfqFromBomResult =
  | CreatedRfq
  | {
      error: string
    }

function assertInternalParams(params: CreateRfqFromBomParams): void {
  if (
    !UUID_PATTERN.test(params.bomId) ||
    !UUID_PATTERN.test(params.tenantId) ||
    (params.actorId !== null && !UUID_PATTERN.test(params.actorId))
  ) {
    throw new TypeError('Invalid internal RFQ identity')
  }
}

function existingLineCount(lineItems: unknown): number {
  return Array.isArray(lineItems) ? lineItems.length : 0
}

/**
 * Internal transaction authority for the transitional Next.js path.
 *
 * Browser code must use the authenticated Server Action wrapper. Background
 * jobs may call this server-only module with identity derived from an
 * authenticated producer or trusted queue event.
 */
export async function createRfqFromBomRecord(
  params: CreateRfqFromBomParams
): Promise<CreateRfqFromBomResult> {
  assertInternalParams(params)

  return db.transaction(async (tx) => {
    const [bom] = await tx
      .select({ id: boms.id, project_id: boms.project_id })
      .from(boms)
      .where(
        and(
          eq(boms.id, params.bomId),
          eq(boms.tenant_id, params.tenantId)
        )
      )
      .limit(1)
      .for('update')

    if (!bom) return { error: 'BOM not found' }

    let auditActorId: string | null = null
    if (params.actorId) {
      const [actor] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, params.actorId),
            eq(users.tenant_id, params.tenantId)
          )
        )
        .limit(1)
      auditActorId = actor?.id ?? null
    }

    const [existing] = await tx
      .select({
        id: rfqs.id,
        line_items: rfqs.line_items,
      })
      .from(rfqs)
      .where(
        and(
          eq(rfqs.bom_id, params.bomId),
          eq(rfqs.tenant_id, params.tenantId)
        )
      )
      .limit(1)

    if (existing) {
      return {
        rfqId: existing.id,
        tenantId: params.tenantId,
        projectId: bom.project_id,
        lineCount: existingLineCount(existing.line_items),
        created: false,
      }
    }

    const lines = await tx
      .select({
        code: bomLineItems.code,
        description: bomLineItems.description,
        unit: bomLineItems.unit,
        quantity: bomLineItems.quantity,
        is_group: bomLineItems.is_group,
      })
      .from(bomLineItems)
      .where(
        and(
          eq(bomLineItems.bom_id, params.bomId),
          eq(bomLineItems.tenant_id, params.tenantId)
        )
      )

    const itemLines = lines.filter((line) => line.is_group === 0)
    if (itemLines.length === 0) {
      return { error: 'BOM has no line items to RFQ' }
    }

    const contracted = await tx
      .select({
        code: materialItems.code,
        material_item_id: materialItems.id,
      })
      .from(rateCards)
      .innerJoin(
        materialItems,
        and(
          eq(rateCards.material_item_id, materialItems.id),
          eq(materialItems.tenant_id, params.tenantId)
        )
      )
      .where(eq(rateCards.tenant_id, params.tenantId))

    const contractedCodes = new Set<string>()
    const materialItemIdByCode = new Map<string, string>()
    for (const item of contracted) {
      if (item.code) {
        contractedCodes.add(item.code)
        materialItemIdByCode.set(item.code, item.material_item_id)
      }
    }

    const rfqLines: RfqLineItemJson[] = itemLines
      .filter(
        (line) => !(line.code && contractedCodes.has(line.code))
      )
      .map((line) => ({
        material_item_id: line.code
          ? materialItemIdByCode.get(line.code) ?? null
          : null,
        code: line.code ?? null,
        description: line.description,
        qty: line.quantity,
        unit: line.unit ?? null,
      }))

    if (rfqLines.length === 0) {
      return {
        error:
          'All BOM lines already have contracted rates — no RFQ needed',
      }
    }

    const [created] = await tx
      .insert(rfqs)
      .values({
        tenant_id: params.tenantId,
        bom_id: params.bomId,
        status: 'pending',
        line_items: rfqLines,
      })
      .returning({ id: rfqs.id })

    if (!created) {
      throw new Error('RFQ insert returned no record')
    }

    await writeAuditLogInTransaction(tx, {
      tenantId: params.tenantId,
      actorId: auditActorId,
      entityType: 'rfq',
      entityId: created.id,
      action: 'create',
      diff: {
        bom_id: params.bomId,
        line_count: rfqLines.length,
        source: params.source,
      },
    })

    return {
      rfqId: created.id,
      tenantId: params.tenantId,
      projectId: bom.project_id,
      lineCount: rfqLines.length,
      created: true,
    }
  })
}

export async function notifyRfqCreated(rfq: CreatedRfq): Promise<void> {
  await notifyRoles({
    tenantId: rfq.tenantId,
    recipientRoles: ['procurement'],
    subject: `New RFQ awaiting quotes (${rfq.lineCount} item${
      rfq.lineCount === 1 ? '' : 's'
    })`,
    body: 'A BOM has been internally approved. Source quotes from suppliers.',
    linkUrl: `/procurement/rfqs/${rfq.rfqId}`,
    payload: {
      event: 'rfq.created',
      rfq_id: rfq.rfqId,
    },
    alsoEmail: true,
    templateId: 'rfq-dispatch',
    templateVars: {
      project_name: rfq.projectId,
      line_count: rfq.lineCount,
      rfq_url: `/procurement/rfqs/${rfq.rfqId}`,
    },
  })
}
