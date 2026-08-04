'use server'

import { revalidatePath } from 'next/cache'
import {
  requireCapability,
  requireUserProfile,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  materialItems,
  stockMovementLines,
  stockMovements,
} from '@third-code-erp/database/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  createStockMovementThroughCoreApi,
  inventoryStockMovementCreateWritesUseCoreApi,
} from '@/lib/erp-core-client'
import {
  quantityToMicros,
  signedQuantityToMicros,
} from '../quantity'

export interface MovementActionResult {
  ok: boolean
  error?: string
  id?: string
  number?: string
}

const uuidSchema = z.string().uuid()
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const movementTypeSchema = z.enum([
  'transfer',
  'consumption',
  'adjustment',
])
const idempotencyKeySchema = z.string().trim().min(1).max(200)

const createMovementSchema = z.object({
  movementType: movementTypeSchema,
  sourceWarehouseId: uuidSchema,
  targetWarehouseId: z.union([uuidSchema, z.literal('')]).optional(),
  projectId: z.union([uuidSchema, z.literal('')]).optional(),
  movementDate: dateSchema,
  reason: z.string().trim().min(3).max(2_000),
  lines: z
    .array(
      z.object({
        materialItemId: uuidSchema,
        quantity: z.string().trim().min(1).max(32),
        costCodeId: z.union([uuidSchema, z.literal('')]).optional(),
        declaredUnitCostPhp: z.string().trim().max(32).optional(),
      })
    )
    .min(1)
    .max(200),
})

const KNOWN_ERRORS = [
  'Stock Movement requires an active source Warehouse',
  'Transfer requires a different target Warehouse',
  'Transfer requires an active target Warehouse',
  'Site Warehouse transfer requires its Project',
  'Transfer Warehouse must match its Project',
  'Consumption requires one source Warehouse and Project',
  'Consumption Warehouse must match its Project',
  'Adjustment uses one source Warehouse',
  'Site Warehouse adjustment requires its Project',
  'Stock Movement requires an active tracked Item and base UOM',
  'Transfer and consumption quantity must be positive',
  'Positive adjustment requires an evidenced unit cost',
  'Negative adjustment uses current weighted-average cost',
  'Declared unit cost requires up to two decimal places',
  'Declared unit cost must be positive and within range',
  'Consumption requires a Cost Code',
  'Consumption requires an active Cost Code',
  'Stock Movement Cost Code must be active',
  'Only a draft Stock Movement can be posted',
  'Stock Movement requires at least one line',
  'Movement date is not in an open fiscal period',
  'Stock Movement quantity exceeds available stock',
  'Stock Movement value must be positive',
  'Inventory account required for Stock Movement',
  'Inventory Consumption account required',
  'Inventory Adjustment Gain account required',
  'Inventory Adjustment Loss account required',
  'Stock Movement reversal reason is required',
  'Only a posted Stock Movement can be reversed',
  'Reversal date cannot precede movement date',
  'Reversal date is not in an open fiscal period',
  'Stock Movement reversal exceeds available stock',
  'Draft Stock Movement not found',
] as const

function safeMovementError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? 'Check the movement fields.'
  }
  const message = error instanceof Error ? error.message : ''
  const known = KNOWN_ERRORS.find((candidate) =>
    message.includes(candidate)
  )
  if (known) return known
  if (
    message.includes('ux_stock_movement_lines_movement_item') ||
    message.includes('duplicate key')
  ) {
    return 'Each Item may appear once per Stock Movement.'
  }
  return 'Stock Movement action failed. Existing stock evidence was unchanged.'
}

function refreshMovement(id?: string) {
  revalidatePath('/inventory')
  revalidatePath('/inventory/movements')
  if (id) revalidatePath(`/inventory/movements/${id}`)
}

function declaredUnitCostCents(value: string | undefined): number | null {
  if (!value) return null
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error('Declared unit cost requires up to two decimal places')
  }
  const cents = Math.round(Number(value) * 100)
  if (
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    cents > 100_000_000_000
  ) {
    throw new Error('Declared unit cost must be positive and within range')
  }
  return cents
}

export async function createStockMovement(
  input: z.input<typeof createMovementSchema> & { idempotencyKey?: string }
): Promise<MovementActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'inventory.manage')
    const parsed = createMovementSchema.parse(input)
    const itemIds = parsed.lines.map((line) => line.materialItemId)
    if (new Set(itemIds).size !== itemIds.length) {
      return {
        ok: false,
        error: 'Each Item may appear once per Stock Movement.',
      }
    }

    if (inventoryStockMovementCreateWritesUseCoreApi(profile.tenantId)) {
      const idempotencyKey = idempotencyKeySchema.safeParse(
        input.idempotencyKey
      )
      if (!idempotencyKey.success) {
        return {
          ok: false,
          error: 'Retry token is required for the Stock Movement command.',
        }
      }
      const result = await createStockMovementThroughCoreApi(
        {
          movementType: parsed.movementType,
          sourceWarehouseId: parsed.sourceWarehouseId,
          targetWarehouseId: parsed.targetWarehouseId || null,
          projectId: parsed.projectId || null,
          movementDate: parsed.movementDate,
          reason: parsed.reason,
          lines: parsed.lines.map((line) => ({
            materialItemId: line.materialItemId,
            quantity: line.quantity,
            costCodeId: line.costCodeId || null,
            declaredUnitCostPhp: line.declaredUnitCostPhp || null,
          })),
        },
        idempotencyKey.data
      )
      if (!result.ok || !result.data) {
        return {
          ok: false,
          error:
            result.error ??
            'Stock Movement could not be created through ERP Core.',
        }
      }
      refreshMovement(result.data.stockMovementId)
      return { ok: true, id: result.data.stockMovementId }
    }

    const items = await db
      .select({
        id: materialItems.id,
        uomId: materialItems.base_uom_id,
        description: materialItems.description,
      })
      .from(materialItems)
      .where(
        and(
          eq(materialItems.tenant_id, profile.tenantId),
          eq(materialItems.is_active, true),
          eq(materialItems.inventory_tracked, true),
          inArray(materialItems.id, itemIds)
        )
      )
    if (items.length !== itemIds.length) {
      return {
        ok: false,
        error: 'Choose only active inventory-tracked Items.',
      }
    }
    const itemById = new Map(items.map((item) => [item.id, item]))

    const lines = parsed.lines.map((line, index) => {
      const item = itemById.get(line.materialItemId)
      if (!item) throw new Error('Tracked Item not found')
      const quantityMicros =
        parsed.movementType === 'adjustment'
          ? signedQuantityToMicros(line.quantity)
          : quantityToMicros(line.quantity)
      const unitCostCents = declaredUnitCostCents(
        line.declaredUnitCostPhp
      )
      if (
        parsed.movementType === 'adjustment' &&
        quantityMicros > 0 &&
        unitCostCents === null
      ) {
        throw new Error(
          'Positive adjustment requires an evidenced unit cost'
        )
      }
      if (
        parsed.movementType === 'adjustment' &&
        quantityMicros < 0 &&
        unitCostCents !== null
      ) {
        throw new Error(
          'Negative adjustment uses current weighted-average cost'
        )
      }
      return {
        tenant_id: profile.tenantId,
        material_item_id: item.id,
        uom_id: item.uomId,
        cost_code_id: line.costCodeId || undefined,
        line_number: index + 1,
        description: item.description,
        quantity_micros: quantityMicros,
        declared_unit_cost_cents: unitCostCents ?? undefined,
      }
    })

    const movementId = await db.transaction(async (tx) => {
      const [movement] = await tx
        .insert(stockMovements)
        .values({
          tenant_id: profile.tenantId,
          movement_type: parsed.movementType,
          source_warehouse_id: parsed.sourceWarehouseId,
          target_warehouse_id: parsed.targetWarehouseId || undefined,
          project_id: parsed.projectId || undefined,
          movement_date: parsed.movementDate,
          currency: 'PHP',
          reason: parsed.reason,
          created_by: profile.user.id,
        })
        .returning({ id: stockMovements.id })
      if (!movement) throw new Error('Stock Movement not found')
      await tx.insert(stockMovementLines).values(
        lines.map((line) => ({
          ...line,
          stock_movement_id: movement.id,
        }))
      )
      return movement.id
    })

    refreshMovement(movementId)
    return { ok: true, id: movementId }
  } catch (error) {
    return { ok: false, error: safeMovementError(error) }
  }
}

export async function postStockMovement(
  movementId: string
): Promise<MovementActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'inventory.post_movement')
    const id = uuidSchema.parse(movementId)
    const rows = await db.execute<{
      movement_number: string
    }>(sql`
      select *
      from public.post_stock_movement(
        ${id}::uuid,
        ${profile.user.id}::uuid
      )
    `)
    refreshMovement(id)
    return { ok: true, id, number: rows[0]?.movement_number }
  } catch (error) {
    return { ok: false, error: safeMovementError(error) }
  }
}

export async function reverseStockMovement(input: {
  movementId: string
  reason: string
  reversalDate: string
}): Promise<MovementActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'inventory.post_movement')
    const parsed = z
      .object({
        movementId: uuidSchema,
        reason: z.string().trim().min(3).max(1_000),
        reversalDate: dateSchema,
      })
      .parse(input)
    await db.execute(sql`
      select *
      from public.reverse_stock_movement(
        ${parsed.movementId}::uuid,
        ${profile.user.id}::uuid,
        ${parsed.reason},
        ${parsed.reversalDate}::date
      )
    `)
    refreshMovement(parsed.movementId)
    return { ok: true, id: parsed.movementId }
  } catch (error) {
    return { ok: false, error: safeMovementError(error) }
  }
}

export async function deleteStockMovementDraft(
  movementId: string
): Promise<MovementActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'inventory.manage')
    const id = uuidSchema.parse(movementId)
    const deleted = await db.transaction(async (tx) => {
      const rows = await tx
        .delete(stockMovements)
        .where(
          and(
            eq(stockMovements.id, id),
            eq(stockMovements.tenant_id, profile.tenantId),
            eq(stockMovements.status, 'draft')
          )
        )
        .returning({ id: stockMovements.id })
      return rows[0]
    })
    if (!deleted) {
      return { ok: false, error: 'Draft Stock Movement not found.' }
    }
    refreshMovement()
    return { ok: true, id }
  } catch (error) {
    return { ok: false, error: safeMovementError(error) }
  }
}
