'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  materialItems,
  poLineItems,
  stockReceiptLines,
  stockReceipts,
  unitsOfMeasure,
  warehouses,
} from '@third-code-erp/database/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  createStockReceiptThroughCoreApi,
  postStockReceiptThroughCoreApi,
  reverseStockReceiptThroughCoreApi,
  stockReceiptCreateWritesUseCoreApi,
  stockReceiptPostWritesUseCoreApi,
  stockReceiptReverseWritesUseCoreApi,
} from '@/lib/erp-core-client'
import { quantityToMicros, receiptLineTotal } from './quantity'

export interface InventoryActionResult {
  ok: boolean
  error?: string
  id?: string
  number?: string
}

const uuidSchema = z.string().uuid()
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const idempotencyKeySchema = z.string().trim().min(1).max(200)

const createReceiptSchema = z.object({
  warehouseId: uuidSchema,
  purchaseOrderId: uuidSchema,
  deliveryScheduleId: z.union([uuidSchema, z.literal('')]).optional(),
  supplierDeliveryReference: z.string().trim().max(120).optional(),
  receivedDate: dateSchema,
  notes: z.string().trim().max(2_000).optional(),
  lines: z
    .array(
      z.object({
        poLineItemId: uuidSchema,
        quantity: z.string().trim().min(1).max(32),
      })
    )
    .min(1)
    .max(250),
})

function safeInventoryError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? 'Check the inventory fields.'
  }
  const message = error instanceof Error ? error.message : ''
  const known = [
    'Quantity requires up to six decimal places',
    'Quantity must be positive and within the supported range',
    'Receipt line value must be positive and within range',
    'Stock Receipt requires a valid PO and active Warehouse',
    'Project Warehouse must match the Purchase Order project',
    'Linked Delivery must be accepted for the same PO',
    'Receipt line must match a tracked PO Item, UOM, and cost',
    'Stock Receipt requires an issued Purchase Order',
    'Stock Receipt quantity exceeds remaining PO quantity',
    'Inventory and Goods Received Not Invoiced accounts required',
    'Posting date is not in an open fiscal period',
    'Only a draft Stock Receipt can be posted',
    'Only a posted Stock Receipt can be reversed',
    'Stock Receipt reversal reason is required',
    'Reversal date cannot precede receipt date',
    'Used UOM identity is immutable',
    'Used Warehouse identity is immutable',
    'Item stock identity is immutable after posting',
  ]
  if (message.includes('ux_units_of_measure_tenant_code')) {
    return 'That UOM code already exists.'
  }
  if (message.includes('ux_warehouses_tenant_code')) {
    return 'That Warehouse code already exists.'
  }
  if (
    message.includes('ux_stock_receipt_lines_receipt_po_line') ||
    message.includes('ux_stock_receipt_lines_receipt_line')
  ) {
    return 'Each Purchase Order line may appear once per Stock Receipt.'
  }
  return (
    known.find((candidate) => message.includes(candidate)) ??
    'Inventory action failed. Existing stock and accounting evidence was unchanged.'
  )
}

function revalidateInventory(receiptId?: string) {
  revalidatePath('/inventory')
  revalidatePath('/inventory/receipts')
  revalidatePath('/purchase-orders')
  if (receiptId) revalidatePath(`/inventory/receipts/${receiptId}`)
}

export async function createUnitOfMeasure(
  formData: FormData
): Promise<InventoryActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'inventory.manage')
    const input = z
      .object({
        code: z.string().trim().min(1).max(32),
        name: z.string().trim().min(1).max(120),
        decimalPlaces: z.coerce.number().int().min(0).max(6),
      })
      .parse({
        code: formData.get('code'),
        name: formData.get('name'),
        decimalPlaces: formData.get('decimalPlaces') ?? 0,
      })

    await db.insert(unitsOfMeasure).values({
      tenant_id: profile.tenantId,
      code: input.code,
      name: input.name,
      decimal_places: input.decimalPlaces,
      created_by: profile.user.id,
    })
    revalidateInventory()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: safeInventoryError(error) }
  }
}

export async function createWarehouse(
  formData: FormData
): Promise<InventoryActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'inventory.manage')
    const input = z
      .object({
        code: z.string().trim().min(1).max(40),
        name: z.string().trim().min(1).max(160),
        projectId: z.union([uuidSchema, z.literal('')]).optional(),
      })
      .parse({
        code: formData.get('code'),
        name: formData.get('name'),
        projectId: formData.get('projectId') ?? '',
      })

    await db.insert(warehouses).values({
      tenant_id: profile.tenantId,
      code: input.code,
      name: input.name,
      project_id: input.projectId || null,
      created_by: profile.user.id,
    })
    revalidateInventory()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: safeInventoryError(error) }
  }
}

export async function configureInventoryItem(
  formData: FormData
): Promise<InventoryActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'inventory.manage')
    const input = z
      .object({
        materialItemId: uuidSchema,
        uomId: uuidSchema,
        tracked: z.boolean(),
      })
      .parse({
        materialItemId: formData.get('materialItemId'),
        uomId: formData.get('uomId'),
        tracked: formData.get('tracked') === 'on',
      })

    const [uom] = await db
      .select({ code: unitsOfMeasure.code })
      .from(unitsOfMeasure)
      .where(
        and(
          eq(unitsOfMeasure.id, input.uomId),
          eq(unitsOfMeasure.tenant_id, profile.tenantId),
          eq(unitsOfMeasure.is_active, true)
        )
      )
      .limit(1)
    if (!uom) throw new Error('Active UOM not found')

    const [updated] = await db
      .update(materialItems)
      .set({
        base_uom_id: input.uomId,
        unit: uom.code,
        inventory_tracked: input.tracked,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(materialItems.id, input.materialItemId),
          eq(materialItems.tenant_id, profile.tenantId)
        )
      )
      .returning({ id: materialItems.id })
    if (!updated) throw new Error('Item not found')

    revalidateInventory()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: safeInventoryError(error) }
  }
}

export async function createStockReceipt(
  input: z.input<typeof createReceiptSchema> & { idempotencyKey?: string }
): Promise<InventoryActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'inventory.manage')
    const parsed = createReceiptSchema.parse(input)
    const lineIds = parsed.lines.map((line) => line.poLineItemId)
    if (new Set(lineIds).size !== lineIds.length) {
      throw new Error('Each Purchase Order line may appear once per Stock Receipt.')
    }

    if (stockReceiptCreateWritesUseCoreApi(profile.tenantId)) {
      const idempotencyKey = idempotencyKeySchema.safeParse(input.idempotencyKey)
      if (!idempotencyKey.success) {
        return {
          ok: false,
          error: 'Retry token is required for the Stock Receipt command.',
        }
      }
      const result = await createStockReceiptThroughCoreApi(
        {
          warehouseId: parsed.warehouseId,
          purchaseOrderId: parsed.purchaseOrderId,
          deliveryScheduleId: parsed.deliveryScheduleId || null,
          supplierDeliveryReference: parsed.supplierDeliveryReference || null,
          receivedDate: parsed.receivedDate,
          notes: parsed.notes || null,
          lines: parsed.lines,
        },
        idempotencyKey.data
      )
      if (!result.ok || !result.data) {
        return {
          ok: false,
          error:
            result.error ??
            'Stock Receipt could not be created through ERP Core.',
        }
      }
      revalidateInventory(result.data.stockReceiptId)
      return { ok: true, id: result.data.stockReceiptId }
    }

    const sourceLines = await db
      .select({
        id: poLineItems.id,
        po_id: poLineItems.po_id,
        description: poLineItems.description,
        material_item_id: poLineItems.material_item_id,
        uom_id: poLineItems.uom_id,
        unit_cost_cents: poLineItems.unit_cost_cents,
      })
      .from(poLineItems)
      .where(
        and(
          eq(poLineItems.tenant_id, profile.tenantId),
          inArray(poLineItems.id, lineIds)
        )
      )
    if (
      sourceLines.length !== lineIds.length ||
      sourceLines.some(
        (line) =>
          line.po_id !== parsed.purchaseOrderId ||
          !line.material_item_id ||
          !line.uom_id
      )
    ) {
      throw new Error('Receipt line must match a tracked PO Item, UOM, and cost')
    }

    const sourceById = new Map(sourceLines.map((line) => [line.id, line]))
    const receiptId = await db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(stockReceipts)
        .values({
          tenant_id: profile.tenantId,
          warehouse_id: parsed.warehouseId,
          purchase_order_id: parsed.purchaseOrderId,
          delivery_schedule_id: parsed.deliveryScheduleId || null,
          supplier_delivery_reference:
            parsed.supplierDeliveryReference || null,
          received_date: parsed.receivedDate,
          notes: parsed.notes || null,
          created_by: profile.user.id,
        })
        .returning({ id: stockReceipts.id })
      if (!receipt) throw new Error('Stock Receipt was not created')

      await tx.insert(stockReceiptLines).values(
        parsed.lines.map((line, index) => {
          const source = sourceById.get(line.poLineItemId)!
          const quantityMicros = quantityToMicros(line.quantity)
          return {
            tenant_id: profile.tenantId,
            stock_receipt_id: receipt.id,
            po_line_item_id: source.id,
            material_item_id: source.material_item_id!,
            uom_id: source.uom_id!,
            line_number: index + 1,
            description: source.description,
            quantity_micros: quantityMicros,
            unit_cost_cents: source.unit_cost_cents,
            line_total_cents: receiptLineTotal(
              quantityMicros,
              source.unit_cost_cents
            ),
          }
        })
      )
      return receipt.id
    })

    revalidateInventory(receiptId)
    return { ok: true, id: receiptId }
  } catch (error) {
    return { ok: false, error: safeInventoryError(error) }
  }
}

export async function deleteStockReceiptDraft(
  receiptId: string
): Promise<InventoryActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'inventory.manage')
    const id = uuidSchema.parse(receiptId)
    const deleted = await db.transaction(async (tx) => {
      const [draft] = await tx
        .select({ id: stockReceipts.id })
        .from(stockReceipts)
        .where(
          and(
            eq(stockReceipts.id, id),
            eq(stockReceipts.tenant_id, profile.tenantId),
            eq(stockReceipts.status, 'draft')
          )
        )
        .limit(1)
      if (!draft) return null
      await tx
        .delete(stockReceiptLines)
        .where(
          and(
            eq(stockReceiptLines.stock_receipt_id, id),
            eq(stockReceiptLines.tenant_id, profile.tenantId)
          )
        )
      const [row] = await tx
        .delete(stockReceipts)
        .where(
          and(
            eq(stockReceipts.id, id),
            eq(stockReceipts.tenant_id, profile.tenantId)
          )
        )
        .returning({ id: stockReceipts.id })
      return row ?? null
    })
    if (!deleted) return { ok: false, error: 'Stock Receipt draft not found.' }
    revalidateInventory()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: safeInventoryError(error) }
  }
}

export async function postStockReceipt(input: {
  receiptId: string
  postingDate: string
  idempotencyKey?: string
}): Promise<InventoryActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'inventory.post_receipt')
    const parsed = z
      .object({ receiptId: uuidSchema, postingDate: dateSchema })
      .parse(input)
    if (stockReceiptPostWritesUseCoreApi(profile.tenantId)) {
      const idempotencyKey = idempotencyKeySchema.safeParse(input.idempotencyKey)
      if (!idempotencyKey.success) {
        return {
          ok: false,
          error: 'Retry token is required for the Stock Receipt command.',
        }
      }
      const result = await postStockReceiptThroughCoreApi(
        parsed.receiptId,
        { postingDate: parsed.postingDate },
        idempotencyKey.data
      )
      if (!result.ok || !result.data) {
        return {
          ok: false,
          error:
            result.error ??
            'Stock Receipt could not be posted through ERP Core.',
        }
      }
      revalidateInventory(parsed.receiptId)
      revalidatePath('/finance')
      revalidatePath('/finance/ledger')
      return {
        ok: true,
        id: result.data.stockReceiptId,
        number: result.data.receiptNumber,
      }
    }
    const rows = await db.execute<{
      stock_receipt_id: string
      receipt_number: string
    }>(sql`
      select stock_receipt_id, receipt_number
      from public.post_stock_receipt(
        ${parsed.receiptId}::uuid,
        ${profile.user.id}::uuid,
        ${parsed.postingDate}::date
      )
    `)
    const result = rows[0]
    if (!result) throw new Error('Stock Receipt posting returned no result')
    revalidateInventory(parsed.receiptId)
    revalidatePath('/finance')
    revalidatePath('/finance/ledger')
    return {
      ok: true,
      id: parsed.receiptId,
      number: result.receipt_number,
    }
  } catch (error) {
    return { ok: false, error: safeInventoryError(error) }
  }
}

export async function reverseStockReceipt(input: {
  receiptId: string
  postingDate: string
  reason: string
  idempotencyKey?: string
}): Promise<InventoryActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'inventory.post_receipt')
    const parsed = z
      .object({
        receiptId: uuidSchema,
        postingDate: dateSchema,
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input)
    if (stockReceiptReverseWritesUseCoreApi(profile.tenantId)) {
      const idempotencyKey = idempotencyKeySchema.safeParse(input.idempotencyKey)
      if (!idempotencyKey.success) {
        return {
          ok: false,
          error: 'Retry token is required for the Stock Receipt command.',
        }
      }
      const result = await reverseStockReceiptThroughCoreApi(
        parsed.receiptId,
        {
          postingDate: parsed.postingDate,
          reason: parsed.reason,
        },
        idempotencyKey.data
      )
      if (!result.ok || !result.data) {
        return {
          ok: false,
          error:
            result.error ??
            'Stock Receipt could not be reversed through ERP Core.',
        }
      }
      revalidateInventory(parsed.receiptId)
      revalidatePath('/finance')
      revalidatePath('/finance/ledger')
      return { ok: true, id: result.data.stockReceiptId }
    }
    await db.execute(sql`
      select *
      from public.reverse_stock_receipt(
        ${parsed.receiptId}::uuid,
        ${profile.user.id}::uuid,
        ${parsed.reason},
        ${parsed.postingDate}::date
      )
    `)
    revalidateInventory(parsed.receiptId)
    revalidatePath('/finance')
    revalidatePath('/finance/ledger')
    return { ok: true, id: parsed.receiptId }
  } catch (error) {
    return { ok: false, error: safeInventoryError(error) }
  }
}
