'use server'

import { revalidatePath } from 'next/cache'
import { getUserProfile, requireCapability } from '@third-code-erp/auth'
import { db, liveProjectCondition, type Database } from '@third-code-erp/database'
import {
  materialItems,
  poLineItems,
  purchaseOrders,
  stockReceiptLines,
  unitsOfMeasure,
} from '@third-code-erp/database/schema'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { writeAuditLogInTransaction } from '@/lib/audit'
import { errorChainMessage } from '@/lib/error-chain-message'
import {
  uomForLinkedItem,
  uomForNewItem,
} from '@/lib/procurement/po-line-stock-link'

const uuid = z.string().uuid()

const linkPoLineInputSchema = z.discriminatedUnion('mode', [
  z.object({
    lineId: uuid,
    mode: z.literal('existing'),
    materialItemId: uuid,
  }),
  z.object({ lineId: uuid, mode: z.literal('create') }),
])

export type LinkPoLineToItemInput = z.input<typeof linkPoLineInputSchema>

const LINE_NOT_FOUND = 'Purchase Order line not found.'
const RECEIPTED_ERROR =
  'This line already has a Stock Receipt, so its stock item and unit can no longer change.'
const DUPLICATE_ITEM_ERROR =
  'A stock item with this code already exists. Pick it from the list instead.'
// Same text as procurement/actions.ts: a retired project's PO is not committed further.
const RETIRED_PROJECT_PO_ERROR =
  'This Purchase Order belongs to a retired project; it can only be rejected, cancelled or received.'
const INACTIVE_COST_CODE_ERROR =
  "This line's Cost Code is inactive. Reactivate it or assign an active Cost Code before linking a stock item."

/** The database rule the insert trigger uses: UOM code first, then a tenant alias. */
async function resolveUnitUomId(tenantId: string, unit: string | null): Promise<string | null> {
  if (!unit) return null
  const rows = await db.execute<{ uom_id: string | null }>(
    sql`select public.resolve_unit_of_measure(${tenantId}::uuid, ${unit}) as uom_id`
  )
  return rows[0]?.uom_id ?? null
}

function linkErrorMessage(error: unknown): string {
  const chain = errorChainMessage(error)
  if (chain.includes('Purchase Order stock terms are immutable after receipt')) {
    return RECEIPTED_ERROR
  }
  if (chain.includes(RETIRED_PROJECT_PO_ERROR)) return RETIRED_PROJECT_PO_ERROR
  // guard_po_line_budget_dimension (SQLSTATE 23514) refuses any write to a line on an inactive Cost Code.
  if (chain.includes('Purchase Order line requires an active Cost Code')) {
    return INACTIVE_COST_CODE_ERROR
  }
  if (chain.includes('idx_material_items_tenant_code')) {
    return DUPLICATE_ITEM_ERROR
  }
  console.error('[po-line-link] save failed', databaseErrorTag(error))
  return 'The stock item link could not be saved. Nothing was changed.'
}

/** SQLSTATE and constraint name of a database error; never its SQL text or parameters. */
function databaseErrorTag(error: unknown): string {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current)
    const { code, constraint_name: constraint, cause } = current as Record<string, unknown>
    if (typeof code === 'string') {
      return typeof constraint === 'string' ? `${code} ${constraint}` : code
    }
    current = cause
  }
  return error instanceof Error ? error.name : 'unknown'
}

/**
 * Link a Purchase Order line to a stock-tracked item and set its unit to the
 * item's unit, or create a tracked item from the line. Without the link the
 * line cannot be received into stock. A unit that differs from the item's unit
 * is refused: unit equivalence is data (units and aliases), never a guess.
 */
export async function linkPoLineToItem(
  input: LinkPoLineToItemInput
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  try {
    requireCapability(profile, 'inventory.manage')
  } catch {
    return { error: 'You do not have permission to link stock items.' }
  }
  const parsed = linkPoLineInputSchema.safeParse(input)
  if (!parsed.success) return { error: 'Choose a stock item to link.' }
  const request = parsed.data
  const tenantId = profile.tenantId

  try {
    const [line] = await db
      .select({
        id: poLineItems.id,
        poId: poLineItems.po_id,
        code: poLineItems.code,
        description: poLineItems.description,
        unit: poLineItems.unit,
        materialItemId: poLineItems.material_item_id,
        uomId: poLineItems.uom_id,
        poStatus: purchaseOrders.status,
        projectId: purchaseOrders.project_id,
        projectLive: liveProjectCondition(purchaseOrders.project_id, tenantId).mapWith(Boolean),
      })
      .from(poLineItems)
      .innerJoin(
        purchaseOrders,
        and(
          eq(purchaseOrders.id, poLineItems.po_id),
          eq(purchaseOrders.tenant_id, poLineItems.tenant_id)
        )
      )
      .where(
        and(
          eq(poLineItems.id, request.lineId),
          eq(poLineItems.tenant_id, tenantId)
        )
      )
      .limit(1)
    if (!line) return { error: LINE_NOT_FOUND }
    if (line.poStatus === 'cancelled') {
      return { error: 'A cancelled Purchase Order cannot be changed.' }
    }
    if (!line.projectLive) return { error: RETIRED_PROJECT_PO_ERROR }

    const [receipted] = await db
      .select({ id: stockReceiptLines.id })
      .from(stockReceiptLines)
      .where(
        and(
          eq(stockReceiptLines.tenant_id, tenantId),
          eq(stockReceiptLines.po_line_item_id, line.id)
        )
      )
      .limit(1)
    if (receipted) return { error: RECEIPTED_ERROR }

    const resolvedUomId = line.uomId
      ? null
      : await resolveUnitUomId(tenantId, line.unit)

    if (request.mode === 'create') {
      return await createItemFromLine({
        tenantId,
        actorId: profile.user.id,
        line,
        resolvedUomId,
      })
    }

    const [item] = await db
      .select({
        id: materialItems.id,
        code: materialItems.code,
        baseUomId: materialItems.base_uom_id,
        isActive: materialItems.is_active,
        tracked: materialItems.inventory_tracked,
      })
      .from(materialItems)
      .where(
        and(
          eq(materialItems.id, request.materialItemId),
          eq(materialItems.tenant_id, tenantId)
        )
      )
      .limit(1)
    if (!item) return { error: 'Stock item not found.' }
    if (!item.isActive || !item.tracked) {
      return {
        error: `Stock item ${item.code} is not an active stock-tracked item. Turn tracking on in Inventory setup first.`,
      }
    }
    const unit = uomForLinkedItem({
      lineUnit: line.unit,
      lineUomId: line.uomId,
      resolvedUomId,
      itemBaseUomId: item.baseUomId,
      itemCode: item.code,
    })
    if ('error' in unit) return { error: unit.error }

    await db.transaction(async (tx) => {
      await updateLineLink(tx, {
        tenantId,
        actorId: profile.user.id,
        line,
        materialItemId: item.id,
        uomId: unit.uomId,
      })
    })
    revalidateLinkPages(line.poId)
    return {}
  } catch (error) {
    return { error: linkErrorMessage(error) }
  }
}

interface LineForLink {
  id: string
  poId: string
  projectId: string
  code: string | null
  description: string
  unit: string | null
  materialItemId: string | null
  uomId: string | null
}

async function createItemFromLine(input: {
  tenantId: string
  actorId: string
  line: LineForLink
  resolvedUomId: string | null
}): Promise<{ error?: string }> {
  const { tenantId, actorId, line } = input
  const code = line.code?.trim() ?? ''
  if (!code) {
    return { error: 'The line has no item code. Pick an existing stock item instead.' }
  }
  const unit = uomForNewItem({
    lineUnit: line.unit,
    lineUomId: line.uomId,
    resolvedUomId: input.resolvedUomId,
  })
  if ('error' in unit) return { error: unit.error }

  const [uom] = await db
    .select({ code: unitsOfMeasure.code, isActive: unitsOfMeasure.is_active })
    .from(unitsOfMeasure)
    .where(
      and(
        eq(unitsOfMeasure.id, unit.uomId),
        eq(unitsOfMeasure.tenant_id, tenantId)
      )
    )
    .limit(1)
  if (!uom) return { error: 'The line unit of measure was not found.' }
  if (!uom.isActive) return { error: `Unit ${uom.code} is inactive.` }

  const [existing] = await db
    .select({ id: materialItems.id })
    .from(materialItems)
    .where(and(eq(materialItems.tenant_id, tenantId), eq(materialItems.code, code)))
    .limit(1)
  if (existing) return { error: DUPLICATE_ITEM_ERROR }

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(materialItems)
      .values({
        tenant_id: tenantId,
        code,
        description: line.description,
        unit: uom.code,
        base_uom_id: unit.uomId,
        inventory_tracked: true,
        created_by: actorId,
      })
      .returning({ id: materialItems.id })
    if (!created) throw new Error('Stock item was not created')
    await writeAuditLogInTransaction(tx, {
      tenantId,
      actorId,
      entityType: 'material_item',
      entityId: created.id,
      action: 'create',
      diff: {
        code,
        unit: uom.code,
        inventory_tracked: true,
        source_po_line_id: line.id,
      },
    })
    await updateLineLink(tx, {
      tenantId,
      actorId,
      line,
      materialItemId: created.id,
      uomId: unit.uomId,
    })
  })
  revalidateLinkPages(line.poId)
  return {}
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

async function updateLineLink(
  tx: Transaction,
  input: {
    tenantId: string
    actorId: string
    line: LineForLink
    materialItemId: string
    uomId: string
  }
): Promise<void> {
  const { tenantId, actorId, line } = input
  const updated = await tx
    .update(poLineItems)
    .set({ material_item_id: input.materialItemId, uom_id: input.uomId })
    .where(
      and(
        eq(poLineItems.id, line.id),
        eq(poLineItems.tenant_id, tenantId),
        liveProjectCondition(line.projectId, tenantId)
      )
    )
    .returning({ id: poLineItems.id })
  // Nothing deletes a PO line, so an empty update means the project was retired
  // after the read. Throwing rolls back an item created in the same transaction.
  if (updated.length === 0) throw new Error(RETIRED_PROJECT_PO_ERROR)
  await writeAuditLogInTransaction(tx, {
    tenantId,
    actorId,
    entityType: 'po_line_item',
    entityId: line.id,
    action: 'update',
    diff: {
      po_id: line.poId,
      from: { material_item_id: line.materialItemId, uom_id: line.uomId },
      to: { material_item_id: input.materialItemId, uom_id: input.uomId },
    },
  })
}

function revalidateLinkPages(poId: string): void {
  revalidatePath(`/purchase-orders/${poId}`)
  revalidatePath('/inventory/receipts/new')
}
