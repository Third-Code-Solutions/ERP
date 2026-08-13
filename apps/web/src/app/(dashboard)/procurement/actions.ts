'use server'

import { revalidatePath } from 'next/cache'
import { getUserProfile, requireCapability, can, type AppRole } from '@third-code-erp/auth'
import { db, type Database } from '@third-code-erp/database'
import {
  bomLineItems,
  boms,
  costCodes,
  invoices,
  materialItems,
  poLineItems,
  projectBudgetLines,
  projectBudgets,
  projects,
  purchaseOrders,
  rateCards,
  vendors,
} from '@third-code-erp/database/schema'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { writeAuditLog, writeAuditLogInTransaction } from '@/lib/audit'
import { notifyRoles, notifyExternalEmail } from '@/lib/operations/notifications'
import {
  formatPurchaseOrderNumber,
  PURCHASE_ORDER_SEQUENCE_KEY,
} from '@/lib/operations/purchase-order-number'
import {
  createGroupedPoFromBomInputSchema,
  createPoFromBomInputSchema,
  standalonePurchaseOrderInputSchema,
  type PurchaseOrderLineItemInput,
} from '@/lib/operations/purchase-order-inputs'
import {
  calculateLineTotalCents,
  calculatePurchaseOrderTotals,
} from '@/lib/operations/purchase-order-money'
import {
  computeEWT,
  computeRetention,
  computeVAT,
  progressBillingAmount,
} from '@third-code-erp/shared-types/bom'

// ── Vendor ────────────────────────────────────────────────────────────────────

const vendorInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(60).optional(),
  birTin: z.string().trim().max(32).optional(),
  address: z.string().trim().max(1_000).optional(),
  notes: z.string().trim().max(10_000).optional(),
})

export async function createVendor(formData: FormData): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  try {
    requireCapability(profile, 'po.create')
  } catch {
    return { error: 'You do not have permission to create vendors.' }
  }

  const parsedInput = vendorInputSchema.safeParse({
    name: formData.get('name'),
    contactName: str(formData.get('contact_name')),
    email: str(formData.get('email')),
    phone: str(formData.get('phone')),
    birTin: str(formData.get('bir_tin')),
    address: str(formData.get('address')),
    notes: str(formData.get('notes')),
  })
  if (!parsedInput.success) return { error: 'Invalid vendor details' }

  try {
    await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(vendors)
        .values({
          tenant_id: profile.tenantId,
          name: parsedInput.data.name,
          contact_name: parsedInput.data.contactName,
          email: parsedInput.data.email,
          phone: parsedInput.data.phone,
          bir_tin: parsedInput.data.birTin,
          address: parsedInput.data.address,
          notes: parsedInput.data.notes,
        })
        .returning({ id: vendors.id })

      if (!inserted) throw new Error('VENDOR_INSERT_FAILED')

      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'vendor',
        entityId: inserted.id,
        action: 'create',
        diff: { name: parsedInput.data.name },
      })
    })
  } catch {
    return { error: 'Vendor could not be created. Review details and retry.' }
  }

  revalidatePath('/procurement')
  return {}
}

// ── PO from BOM ───────────────────────────────────────────────────────────────

export async function createPoFromBom(
  bomId: string,
  projectId: string,
  vendorId: string | null,
  deliveryDate: string | null
): Promise<{ id: string } | { error: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  try {
    requireCapability(profile, 'po.create')
  } catch {
    return { error: 'You do not have permission to create Purchase Orders.' }
  }
  const user = profile.user
  // Profile hydration already established the caller tenant through the
  // authenticated RLS client; avoid a second unscoped identity lookup.
  const userRow = { tenant_id: profile.tenantId }

  const parsedInput = createPoFromBomInputSchema.safeParse({
    bomId,
    projectId,
    vendorId,
    deliveryDate,
  })
  if (!parsedInput.success) return { error: 'Invalid Purchase Order input' }
  const input = parsedInput.data

  // Verify BOM is approved or locked
  const [bom] = await db
    .select({
      id: boms.id,
      status: boms.status,
      project_id: boms.project_id,
      total_cost_cents: boms.total_cost_cents,
    })
    .from(boms)
    .where(and(eq(boms.id, input.bomId), eq(boms.tenant_id, userRow.tenant_id)))

  if (!bom) return { error: 'BOM not found' }
  if (bom.status === 'draft') return { error: 'BOM must be approved before generating a PO' }
  if (bom.project_id !== input.projectId) {
    return { error: 'BOM does not belong to the selected project' }
  }

  if (input.vendorId) {
    const [vendor] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(
          eq(vendors.id, input.vendorId),
          eq(vendors.tenant_id, userRow.tenant_id)
        )
      )
      .limit(1)
    if (!vendor) return { error: 'Vendor not found' }
  }

  // Copy BOM line items → PO line items
  let poId: string
  try {
    poId = await db.transaction(async (tx) => {
      const [lockedBom] = await tx
        .select({
          id: boms.id,
          status: boms.status,
          project_id: boms.project_id,
          total_cost_cents: boms.total_cost_cents,
        })
        .from(boms)
        .where(and(eq(boms.id, input.bomId), eq(boms.tenant_id, userRow.tenant_id)))
        .limit(1)
        .for('update')

      if (!lockedBom) throw new Error('BOM_NOT_FOUND')
      if (lockedBom.status !== 'approved') throw new Error('BOM_ALREADY_COMMITTED')

      // Read source lines only after acquiring the BOM lock. BOM edits that
      // do not lock the parent row must not race this graph copy and produce
      // a PO whose totals and provenance disagree with its source snapshot.
      const lines = await tx
        .select()
        .from(bomLineItems)
        .where(
          and(
            eq(bomLineItems.bom_id, input.bomId),
            eq(bomLineItems.tenant_id, userRow.tenant_id)
          )
        )
        .for('update')
      if (lines.length === 0) throw new Error('BOM_NO_LINES')

      const budgetCodeByBomLine = await approvedBudgetCodesByBomLine(
        tx,
        userRow.tenant_id,
        input.projectId,
        input.bomId
      )

      // Reserve the number and persist the PO graph in one transaction. A
      // failed line insert must not consume a visible Purchase Order number.
      const totals = calculatePurchaseOrderTotals(lockedBom.total_cost_cents)
      const reservedNumber = await allocateNextPurchaseOrderNumber(
        tx,
        userRow.tenant_id
      )
      const [po] = await tx
        .insert(purchaseOrders)
        .values({
          tenant_id: userRow.tenant_id,
          project_id: lockedBom.project_id,
          vendor_id: input.vendorId ?? undefined,
          created_by: user.id,
          po_number: reservedNumber,
          status: 'draft',
          subtotal_cents: totals.subtotalCents,
          vat_cents: totals.vatCents,
          withholding_tax_cents: totals.withholdingTaxCents,
          total_cents: totals.totalCents,
          delivery_date: input.deliveryDate ? new Date(input.deliveryDate) : undefined,
        })
        .returning({ id: purchaseOrders.id })
      if (!po) throw new Error('Failed to create Purchase Order')

      if (lines.length > 0) {
        await tx.insert(poLineItems).values(
          lines.map((l, idx) => ({
            tenant_id: userRow.tenant_id,
            po_id: po.id,
            sort_order: idx,
            code: l.code ?? undefined,
            description: l.description,
            unit: l.unit ?? undefined,
            quantity: l.quantity,
            unit_cost_cents: l.unit_cost_cents,
            line_total_cents: calculateLineTotalCents(l.unit_cost_cents, l.quantity),
            bom_line_item_id: l.id,
            cost_code_id: budgetCodeByBomLine.get(l.id),
          }))
        )
      }

      await tx
        .update(boms)
        .set({ status: 'locked', updated_at: new Date() })
        .where(and(eq(boms.id, input.bomId), eq(boms.tenant_id, userRow.tenant_id)))

      await writeAuditLogInTransaction(tx, {
        tenantId: userRow.tenant_id,
        actorId: user.id,
        entityType: 'bom',
        entityId: input.bomId,
        action: 'lock',
        diff: { reason: 'PO generated', po_id: po.id },
      })

      await writeAuditLogInTransaction(tx, {
        tenantId: userRow.tenant_id,
        actorId: user.id,
        entityType: 'purchase_order',
        entityId: po.id,
        action: 'create',
        diff: { po_number: reservedNumber, bom_id: input.bomId, status: 'draft' },
      })

      return po.id
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'BOM_NOT_FOUND') {
      return { error: 'BOM not found' }
    }
    if (error instanceof Error && error.message === 'BOM_ALREADY_COMMITTED') {
      return { error: 'BOM has already been committed to Purchase Orders' }
    }
    if (error instanceof Error && error.message === 'BOM_NO_LINES') {
      return { error: 'BOM has no line items to purchase' }
    }
    if (error instanceof RangeError) {
      return { error: 'Purchase Order amount exceeds the supported centavo range' }
    }
    return { error: 'Purchase Order could not be created. Review the BOM and retry.' }
  }

  revalidatePath(`/projects/${input.projectId}/bom`)
  revalidatePath('/purchase-orders')
  return { id: poId }
}

// ── PO status advance ─────────────────────────────────────────────────────────

const VALID_PO_TRANSITIONS: Record<string, string[]> = {
  // Legacy flow — preserved for back-compat.
  draft: ['submitted', 'cancelled'],
  submitted: ['confirmed', 'cancelled'],
  confirmed: ['partial_delivery', 'delivered', 'cancelled'],
  partial_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
  // Three-step delivery tail (REFACTOR.md US-Pre-003). Approval steps
  // themselves use dedicated server actions (submit/pm/commercial/scm),
  // but delivery transitions can go through advancePoStatus.
  issued: ['partial_delivery', 'fully_delivered', 'cancelled'],
  partial_delivered: ['fully_delivered', 'cancelled'],
  fully_delivered: [],
}

const PO_BUDGET_ERRORS = [
  'Blocked budget requires a Cost Code on every PO line',
  'Blocked budget does not contain PO Cost Code',
  'Purchase Order commitment exceeds blocked Cost Code budget',
] as const

function safePoBudgetError(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  return (
    PO_BUDGET_ERRORS.find((message) => error.message.includes(message)) ?? null
  )
}

export async function createStandalonePo(
  formData: FormData
): Promise<{ id: string } | { error: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  try {
    requireCapability(profile, 'po.create')
  } catch {
    return { error: 'You do not have permission to create Purchase Orders.' }
  }
  const user = profile.user
  const userRow = { tenant_id: profile.tenantId }

  const rawLineItems = formData.get('line_items')
  if (typeof rawLineItems !== 'string') return { error: 'Invalid line items' }

  let decodedLineItems: unknown
  try {
    decodedLineItems = JSON.parse(rawLineItems) as unknown
  } catch {
    return { error: 'Invalid line items' }
  }

  const parsedInput = standalonePurchaseOrderInputSchema.safeParse({
    projectId: str(formData.get('project_id')),
    vendorId: str(formData.get('vendor_id')) ?? null,
    deliveryDate: str(formData.get('delivery_date')) ?? null,
    notes: str(formData.get('notes')),
    lineItems: decodedLineItems,
  })
  if (!parsedInput.success) return { error: 'Invalid Purchase Order input' }
  const input = parsedInput.data
  const lines: PurchaseOrderLineItemInput[] = input.lineItems

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.tenant_id, userRow.tenant_id)
      )
    )
    .limit(1)
  if (!project) return { error: 'Project not found' }

  if (input.vendorId) {
    const [vendor] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(
        and(
          eq(vendors.id, input.vendorId),
          eq(vendors.tenant_id, userRow.tenant_id)
        )
      )
      .limit(1)
    if (!vendor) return { error: 'Vendor not found' }
  }

  const selectedCodeIds = [...new Set(lines.map((line) => line.costCodeId))]
  const selectedCodes = await db
    .select({ id: costCodes.id })
    .from(costCodes)
    .where(
      and(
        eq(costCodes.tenant_id, userRow.tenant_id),
        eq(costCodes.is_active, true),
        inArray(costCodes.id, selectedCodeIds)
      )
    )
  if (selectedCodes.length !== selectedCodeIds.length) {
    return { error: 'Every Purchase Order line requires an active Cost Code' }
  }

  let totals: ReturnType<typeof calculatePurchaseOrderTotals>
  try {
    const subtotalCents = lines.reduce((sum, line) => {
      const next = sum + calculateLineTotalCents(line.unit_cost_cents, line.quantity)
      if (!Number.isSafeInteger(next)) {
        throw new RangeError('Subtotal exceeds the supported centavo range')
      }
      return next
    }, 0)
    totals = calculatePurchaseOrderTotals(subtotalCents)
  } catch {
    return { error: 'Purchase Order amount exceeds the supported centavo range' }
  }

  let poId: string
  try {
    poId = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${
          `po-number:${userRow.tenant_id}`
        }))`
      )
      const nextNum = await allocateNextPurchaseOrderNumber(
        tx,
        userRow.tenant_id
      )

      const [po] = await tx
        .insert(purchaseOrders)
        .values({
          tenant_id: userRow.tenant_id,
          project_id: input.projectId,
          vendor_id: input.vendorId ?? undefined,
          created_by: user.id,
          po_number: nextNum,
          status: 'draft',
          subtotal_cents: totals.subtotalCents,
          vat_cents: totals.vatCents,
          withholding_tax_cents: totals.withholdingTaxCents,
          total_cents: totals.totalCents,
          delivery_date: input.deliveryDate ? new Date(input.deliveryDate) : undefined,
          notes: input.notes,
        })
        .returning({ id: purchaseOrders.id })
      if (!po) throw new Error('Failed to create Purchase Order')

      await tx.insert(poLineItems).values(
        lines.map((l, idx) => ({
          tenant_id: userRow.tenant_id,
          po_id: po.id,
          sort_order: idx,
          code: l.code || undefined,
          description: l.description,
          unit: l.unit || undefined,
          quantity: l.quantity,
          unit_cost_cents: l.unit_cost_cents,
          line_total_cents: calculateLineTotalCents(l.unit_cost_cents, l.quantity),
          cost_code_id: l.costCodeId,
        }))
      )

      await writeAuditLogInTransaction(tx, {
        tenantId: userRow.tenant_id,
        actorId: user.id,
        entityType: 'purchase_order',
        entityId: po.id,
        action: 'create',
        diff: {
          po_number: nextNum,
          project_id: input.projectId,
          vendor_id: input.vendorId,
          subtotal_cents: totals.subtotalCents,
        },
      })
      return po.id
    })
  } catch (error) {
    return {
      error:
        safePoBudgetError(error) ??
        'Purchase Order could not be created. Review the line evidence and retry.',
    }
  }

  revalidatePath('/purchase-orders')
  return { id: poId }
}

export async function assignPoLineCostCode(
  lineId: string,
  costCodeId: string
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  try {
    requireCapability(profile, 'po.create')
  } catch {
    return { error: 'You do not have permission to edit this Purchase Order.' }
  }

  const [line] = await db
    .select({
      id: poLineItems.id,
      poId: poLineItems.po_id,
      currentCostCodeId: poLineItems.cost_code_id,
      status: purchaseOrders.status,
      projectId: purchaseOrders.project_id,
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
        eq(poLineItems.id, lineId),
        eq(poLineItems.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!line) return { error: 'Purchase Order line not found.' }
  if (line.status !== 'draft') {
    return { error: 'Cost Code can change only while the Purchase Order is draft.' }
  }

  const [code] = await db
    .select({ id: costCodes.id })
    .from(costCodes)
    .where(
      and(
        eq(costCodes.id, costCodeId),
        eq(costCodes.tenant_id, profile.tenantId),
        eq(costCodes.is_active, true)
      )
    )
    .limit(1)
  if (!code) return { error: 'Select an active Cost Code.' }

  await db
    .update(poLineItems)
    .set({ cost_code_id: code.id })
    .where(
      and(
        eq(poLineItems.id, line.id),
        eq(poLineItems.tenant_id, profile.tenantId)
      )
    )
  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'po_line_item',
    entityId: line.id,
    action: 'update',
    diff: {
      from: line.currentCostCodeId,
      to: code.id,
      po_id: line.poId,
    },
  })
  revalidatePath(`/purchase-orders/${line.poId}`)
  if (line.projectId) {
    revalidatePath(`/projects/${line.projectId}/cost`)
    revalidatePath(`/projects/${line.projectId}/cost/budget`)
  }
  return {}
}

export async function advancePoStatus(
  poId: string,
  nextStatus: string
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  try {
    if (nextStatus === 'submitted') {
      requireCapability(profile, 'po.create')
    } else if (nextStatus === 'confirmed') {
      requireCapability(profile, 'po.approve')
    } else {
      requireCapability(profile, 'po.issue')
    }
  } catch (error) {
    return { error: 'You do not have permission to change Purchase Order status.' }
  }

  const [po] = await db
    .select({ id: purchaseOrders.id, status: purchaseOrders.status, project_id: purchaseOrders.project_id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'PO not found' }

  const allowed = VALID_PO_TRANSITIONS[po.status] ?? []
  if (!allowed.includes(nextStatus)) {
    return { error: `Cannot transition from ${po.status} to ${nextStatus}` }
  }

  try {
    await db
      .update(purchaseOrders)
      .set({ status: nextStatus as typeof purchaseOrders.$inferSelect.status, updated_at: new Date() })
      .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))
  } catch (error) {
    return {
      error:
        safePoBudgetError(error) ??
        'Purchase Order status could not be changed.',
    }
  }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'purchase_order',
    entityId: poId,
    action: 'status_change',
    diff: { from: po.status, to: nextStatus },
  })

  revalidatePath('/purchase-orders')
  if (po.project_id) revalidatePath(`/projects/${po.project_id}`)
  return {}
}

// ── PO line item receive ──────────────────────────────────────────────────────

export async function receivePoLineItem(
  formData: FormData
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  try {
    requireCapability(profile, 'po.issue')
  } catch (error) {
    return { error: 'You do not have permission to receive Purchase Order items.' }
  }

  const lineId = str(formData.get('line_id'))
  if (!lineId) return { error: 'Line item is required' }

  const rawQty = formData.get('received_qty')
  const parsedQty = typeof rawQty === 'string' ? Number(rawQty) : NaN
  if (!Number.isInteger(parsedQty) || parsedQty < 0) {
    return { error: 'Received qty must be a non-negative integer' }
  }

  // Load line and verify tenant via PO
  const [line] = await db
    .select({
      id: poLineItems.id,
      po_id: poLineItems.po_id,
      tenant_id: poLineItems.tenant_id,
      quantity: poLineItems.quantity,
      received_qty: poLineItems.received_qty,
    })
    .from(poLineItems)
    .where(and(eq(poLineItems.id, lineId), eq(poLineItems.tenant_id, profile.tenantId)))

  if (!line) return { error: 'Line item not found' }

  if (parsedQty > line.quantity) {
    return { error: `Received qty cannot exceed ordered quantity (${line.quantity})` }
  }

  // Verify parent PO and check status
  const [po] = await db
    .select({
      id: purchaseOrders.id,
      tenant_id: purchaseOrders.tenant_id,
      status: purchaseOrders.status,
      project_id: purchaseOrders.project_id,
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, line.po_id), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'Purchase order not found' }
  if (po.status === 'cancelled') return { error: 'Cannot receive on a cancelled PO' }

  const now = new Date()
  const oldQty = line.received_qty

  await db
    .update(poLineItems)
    .set({
      received_qty: parsedQty,
      received_at: now,
      received_by: profile.user.id,
    })
    .where(and(eq(poLineItems.id, lineId), eq(poLineItems.tenant_id, profile.tenantId)))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'po_line_item',
    entityId: lineId,
    action: 'update',
    diff: {
      received_qty: { old: oldQty, new: parsedQty },
      po_id: line.po_id,
    },
  })

  // Auto-flip parent PO status if all lines now fully received
  const allLines = await db
    .select({
      id: poLineItems.id,
      quantity: poLineItems.quantity,
      received_qty: poLineItems.received_qty,
    })
    .from(poLineItems)
    .where(and(eq(poLineItems.po_id, line.po_id), eq(poLineItems.tenant_id, profile.tenantId)))

  const allFullyReceived =
    allLines.length > 0 && allLines.every((l) => l.received_qty >= l.quantity)

  // Auto-flip terminal status. Current-flow PO ("issued"/"partial_delivered")
  // resolves to "fully_delivered"; legacy flow stays on "delivered".
  if (allFullyReceived && po.status !== 'delivered' && po.status !== 'fully_delivered') {
    const terminal =
      po.status === 'issued' || po.status === 'partial_delivery'
        ? 'fully_delivered'
        : 'delivered'

    await db
      .update(purchaseOrders)
      .set({
        status: terminal as typeof purchaseOrders.$inferSelect.status,
        updated_at: now,
      })
      .where(and(eq(purchaseOrders.id, line.po_id), eq(purchaseOrders.tenant_id, profile.tenantId)))

    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'purchase_order',
      entityId: line.po_id,
      action: 'status_change',
      diff: { from: po.status, to: terminal, reason: 'all lines fully received' },
    })
  }

  revalidatePath(`/purchase-orders/${line.po_id}`)
  revalidatePath('/purchase-orders')
  if (po.project_id) revalidatePath(`/projects/${po.project_id}`)
  return {}
}

// ── Invoice creation ──────────────────────────────────────────────────────────

export async function createInvoice(
  projectId: string,
  bomId: string,
  billingPercentBps: number,
  dueDate: string | null
): Promise<{ id: string } | { error: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  try {
    requireCapability(profile, 'finance.issue_invoice')
  } catch (error) {
    return { error: 'You do not have permission to create invoices.' }
  }
  if (
    !Number.isInteger(billingPercentBps) ||
    billingPercentBps <= 0 ||
    billingPercentBps > 10_000
  ) {
    return { error: 'Billing percentage must be between 0.01% and 100%' }
  }

  const [project] = await db
    .select({ id: projects.id, account_id: projects.account_id })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!project) return { error: 'Project not found' }

  const [bom] = await db
    .select({
      tcv_cents: boms.tcv_cents,
      status: boms.status,
      project_id: boms.project_id,
    })
    .from(boms)
    .where(and(eq(boms.id, bomId), eq(boms.tenant_id, profile.tenantId)))

  if (!bom) return { error: 'BOM not found' }
  if (bom.project_id !== projectId) {
    return { error: 'BOM belongs to a different project' }
  }
  if (bom.status === 'draft') return { error: 'BOM must be approved before billing' }

  const retentionBps = 1_000
  const subtotalCents = progressBillingAmount(
    bom.tcv_cents,
    billingPercentBps
  )
  const retentionCents = computeRetention(subtotalCents, retentionBps)
  const taxableBaseCents = subtotalCents - retentionCents
  const vatCents = computeVAT(taxableBaseCents)
  const withholdingTaxCents = computeEWT(taxableBaseCents)
  const netAmountCents =
    taxableBaseCents + vatCents - withholdingTaxCents
  const now = new Date()
  const prefix = `INV-${now.getFullYear()}${String(
    now.getMonth() + 1
  ).padStart(2, '0')}-`
  const allocationLockKey =
    `invoice-number:${profile.tenantId}:${prefix}`

  const inserted = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${allocationLockKey}))`
    )
    const [lastInvoice] = await tx
      .select({ invoice_number: invoices.invoice_number })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenant_id, profile.tenantId),
          sql`${invoices.invoice_number} like ${prefix + '%'}`
        )
      )
      .orderBy(desc(invoices.invoice_number))
      .limit(1)

    const previous = Number.parseInt(
      lastInvoice?.invoice_number.split('-').at(-1) ?? '0',
      10
    )
    const next = Number.isFinite(previous) ? previous + 1 : 1
    const invoiceNumber = `${prefix}${String(next).padStart(3, '0')}`
    const [invoice] = await tx
      .insert(invoices)
      .values({
        tenant_id: profile.tenantId,
        project_id: projectId,
        account_id: project.account_id,
        created_by: profile.user.id,
        invoice_number: invoiceNumber,
        status: 'draft',
        billing_percent_bps: billingPercentBps,
        retention_bps: retentionBps,
        subtotal_cents: subtotalCents,
        retention_cents: retentionCents,
        vat_cents: vatCents,
        withholding_tax_cents: withholdingTaxCents,
        net_amount_cents: netAmountCents,
        due_date: dueDate ? new Date(dueDate) : undefined,
      })
      .returning({ id: invoices.id })
    if (!invoice) throw new Error('Failed to create invoice')
    return { id: invoice.id, invoiceNumber }
  })

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'invoice',
    entityId: inserted.id,
    action: 'create',
    diff: {
      invoice_number: inserted.invoiceNumber,
      billing_percent_bps: billingPercentBps,
      subtotal_cents: subtotalCents,
      retention_cents: retentionCents,
      vat_cents: vatCents,
      withholding_tax_cents: withholdingTaxCents,
      net_amount_cents: netAmountCents,
    },
  })

  revalidatePath(`/projects/${projectId}/billing`)
  revalidatePath('/invoices')
  return { id: inserted.id }
}

// ── Three-step PO approval (REFACTOR.md US-Pre-003) ──────────────────────────
//
// Flow: draft → pending_pm_approval → pending_commercial_approval →
//       pending_scm_issuance → issued → partial_delivered → fully_delivered.
// On issuance the supplier receives the PO via email (Resend template
// 'po-issued') and supplier_email_sent_at is stamped.

type PoApprovalStatus =
  | 'draft'
  | 'pending_pm_approval'
  | 'pending_commercial_approval'
  | 'pending_scm_issuance'
  | 'issued'
  | 'partial_delivery'
  | 'fully_delivered'

/** Submit a draft PO into the PM approval queue. */
export async function submitPoForPmApproval(poId: string): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  try {
    requireCapability(profile, 'po.create')
  } catch (err: unknown) {
    return { error: 'You do not have permission to submit Purchase Orders for PM approval.' }
  }

  const [po] = await db
    .select({ id: purchaseOrders.id, status: purchaseOrders.status, project_id: purchaseOrders.project_id, po_number: purchaseOrders.po_number })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'PO not found' }
  if (po.status !== 'draft') return { error: `Cannot submit a PO in status "${po.status}"` }

  const now = new Date()
  await db
    .update(purchaseOrders)
    .set({ status: 'pending_pm_approval', updated_at: now })
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'purchase_order',
    entityId: poId,
    action: 'status_change',
    diff: { from: po.status, to: 'pending_pm_approval', approver_role: profile.role },
  })

  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['sd_pm_pe', 'pm'],
    subject: `PO ${po.po_number} awaiting your approval`,
    body: 'A purchase order is queued for PM review.',
    linkUrl: `/purchase-orders/${poId}`,
  })

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${poId}`)
  if (po.project_id) revalidatePath(`/projects/${po.project_id}`)
  return {}
}

/** PM approves → routes to Commercial. */
export async function pmApprovePo(poId: string): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  // PM/SD-PM-PE approvers — either po.create OR precon.manage_checklist
  // grants PM-level approval per the spec.
  if (!can(profile.role, 'precon.manage_checklist') && !can(profile.role, 'po.create')) {
    return { error: `Forbidden: role "${profile.role}" cannot approve as PM` }
  }

  const [po] = await db
    .select({ id: purchaseOrders.id, status: purchaseOrders.status, project_id: purchaseOrders.project_id, po_number: purchaseOrders.po_number })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'PO not found' }
  if (po.status !== 'pending_pm_approval') return { error: `PO not in PM approval state (${po.status})` }

  const now = new Date()
  await db
    .update(purchaseOrders)
    .set({
      status: 'pending_commercial_approval',
      pm_approved_at: now,
      pm_approved_by: profile.user.id,
      updated_at: now,
    })
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'purchase_order',
    entityId: poId,
    action: 'status_change',
    diff: { from: po.status, to: 'pending_commercial_approval', approver_role: profile.role },
  })

  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['commercial'],
    subject: `PO ${po.po_number} awaiting Commercial approval`,
    body: 'PM has approved this purchase order. Commercial review required.',
    linkUrl: `/purchase-orders/${poId}`,
  })

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${poId}`)
  if (po.project_id) revalidatePath(`/projects/${po.project_id}`)
  return {}
}

/** Commercial approves → routes to SCM for issuance. */
export async function commercialApprovePo(poId: string): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  try {
    requireCapability(profile, 'po.approve')
  } catch (err: unknown) {
    return { error: 'You do not have permission to approve Purchase Orders commercially.' }
  }

  const [po] = await db
    .select({ id: purchaseOrders.id, status: purchaseOrders.status, project_id: purchaseOrders.project_id, po_number: purchaseOrders.po_number })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'PO not found' }
  if (po.status !== 'pending_commercial_approval') {
    return { error: `PO not in Commercial approval state (${po.status})` }
  }

  const now = new Date()
  await db
    .update(purchaseOrders)
    .set({
      status: 'pending_scm_issuance',
      commercial_approved_at: now,
      commercial_approved_by: profile.user.id,
      updated_at: now,
    })
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'purchase_order',
    entityId: poId,
    action: 'status_change',
    diff: { from: po.status, to: 'pending_scm_issuance', approver_role: profile.role },
  })

  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['procurement'],
    subject: `PO ${po.po_number} ready for supplier issuance`,
    body: 'Commercial has approved. SCM may now issue this PO to the supplier.',
    linkUrl: `/purchase-orders/${poId}`,
  })

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${poId}`)
  if (po.project_id) revalidatePath(`/projects/${po.project_id}`)
  return {}
}

/** SCM issues the PO → status 'issued', supplier email dispatched. */
export async function scmIssuePo(poId: string): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  try {
    requireCapability(profile, 'po.issue')
  } catch (err: unknown) {
    return { error: 'You do not have permission to issue Purchase Orders.' }
  }

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      status: purchaseOrders.status,
      project_id: purchaseOrders.project_id,
      po_number: purchaseOrders.po_number,
      total_cents: purchaseOrders.total_cents,
      vendor_id: purchaseOrders.vendor_id,
      supplier_name: vendors.name,
      supplier_email: vendors.email,
    })
    .from(purchaseOrders)
    .leftJoin(
      vendors,
      and(eq(purchaseOrders.vendor_id, vendors.id), eq(vendors.tenant_id, profile.tenantId)),
    )
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'PO not found' }
  if (po.status !== 'pending_scm_issuance') {
    return { error: `PO not in SCM issuance state (${po.status})` }
  }

  const now = new Date()
  let supplierEmailSent = false

  try {
    await db
      .update(purchaseOrders)
      .set({
        status: 'issued',
        scm_issued_at: now,
        scm_issued_by: profile.user.id,
        updated_at: now,
      })
      .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))
  } catch (error) {
    return {
      error:
        safePoBudgetError(error) ??
        'Purchase Order could not be issued.',
    }
  }

  // Dispatch supplier email if we have an address on file. We stamp
  // supplier_email_sent_at only on success so retries are possible.
  if (po.supplier_email && po.supplier_name) {
    try {
      const delivery = await notifyExternalEmail({
        tenantId: profile.tenantId,
        recipientEmail: po.supplier_email,
        subject: `Purchase order ${po.po_number}`,
        templateId: 'po-issued',
        templateVars: {
          po_number: po.po_number,
          total_php: (po.total_cents / 100).toLocaleString('en-PH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          supplier_name: po.supplier_name,
        },
      })
      supplierEmailSent = delivery.delivered
      if (delivery.delivered) {
        try {
          await db
            .update(purchaseOrders)
            .set({
              supplier_email_sent_at: now,
              updated_at: new Date(),
            })
            .where(
              and(
                eq(purchaseOrders.id, poId),
                eq(purchaseOrders.tenant_id, profile.tenantId)
              )
            )
        } catch (stampError: unknown) {
          // Message sent. Do not retry automatically and risk a duplicate email.
          // eslint-disable-next-line no-console
          console.error('PO supplier email evidence stamp failed', stampError)
        }
      }
    } catch (err: unknown) {
      // Email dispatch failures should not block status advance — log
      // Issuance stays committed; operators can resolve delivery separately.
      // eslint-disable-next-line no-console
      console.error('PO supplier email dispatch failed', err)
    }
  }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'purchase_order',
    entityId: poId,
    action: 'status_change',
    diff: {
      from: po.status,
      to: 'issued',
      approver_role: profile.role,
      supplier_email_sent: supplierEmailSent,
    },
  })

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${poId}`)
  if (po.project_id) revalidatePath(`/projects/${po.project_id}`)
  return {}
}

/** Reject an in-flight approval at any pending step. Returns PO to draft. */
export async function rejectPoApproval(
  poId: string,
  reason: string
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  const trimmed = reason.trim()
  if (!trimmed) return { error: 'Rejection reason is required' }

  const [po] = await db
    .select({ id: purchaseOrders.id, status: purchaseOrders.status, project_id: purchaseOrders.project_id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'PO not found' }

  const PENDING: PoApprovalStatus[] = [
    'pending_pm_approval',
    'pending_commercial_approval',
    'pending_scm_issuance',
  ]
  if (!PENDING.includes(po.status as PoApprovalStatus)) {
    return { error: `Cannot reject from status "${po.status}"` }
  }

  // Reject permission mirrors the role that owns the current step.
  const canRejectByRole: Record<string, AppRole[]> = {
    pending_pm_approval: ['admin', 'owner', 'sd_pm_pe', 'pm', 'commercial', 'procurement'],
    pending_commercial_approval: ['admin', 'owner', 'commercial'],
    pending_scm_issuance: ['admin', 'owner', 'procurement', 'commercial'],
  }
  const allowedRoles = canRejectByRole[po.status] ?? []
  if (!allowedRoles.includes(profile.role)) {
    return { error: `Forbidden: role "${profile.role}" cannot reject at step "${po.status}"` }
  }

  const now = new Date()
  await db
    .update(purchaseOrders)
    .set({ status: 'draft', updated_at: now })
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'purchase_order',
    entityId: poId,
    action: 'status_change',
    diff: { from: po.status, to: 'draft', approver_role: profile.role, reason: trimmed },
  })

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${poId}`)
  if (po.project_id) revalidatePath(`/projects/${po.project_id}`)
  return {}
}

// ── Group-by-supplier PO generation ───────────────────────────────────────────
//
// Walks an approved BOM, joins each line to the cheapest active rate_card
// (matched by material_items.code = bom_line_items.code), groups by
// vendor_id, and creates one draft PO per supplier. Lines without a
// matching rate card land in an 'unassigned' bucket which does NOT produce
// a PO — those are surfaced in the wizard UI so a buyer can pick a vendor.

export interface SupplierGroupPreview {
  vendor_id: string | null
  vendor_name: string
  line_count: number
  subtotal_cents: number
}

export interface GroupedPoResult {
  created_po_ids: string[]
  groups: SupplierGroupPreview[]
}

export async function createPosFromBomGrouped(
  bomId: string
): Promise<GroupedPoResult | { error: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  const parsedInput = createGroupedPoFromBomInputSchema.safeParse({ bomId })
  if (!parsedInput.success) return { error: 'Invalid Purchase Order input' }
  const requestBomId = parsedInput.data.bomId

  try {
    requireCapability(profile, 'po.create')
  } catch (err: unknown) {
    return { error: 'You do not have permission to create grouped Purchase Orders.' }
  }

  const [bom] = await db
    .select({
      id: boms.id,
      status: boms.status,
      project_id: boms.project_id,
    })
    .from(boms)
    .where(and(eq(boms.id, requestBomId), eq(boms.tenant_id, profile.tenantId)))

  if (!bom) return { error: 'BOM not found' }
  if (bom.status === 'draft') {
    return { error: 'BOM must be approved before generating POs' }
  }

  // Pull lines for this BOM (excluding group headers)
  const lines = await db
    .select()
    .from(bomLineItems)
    .where(and(eq(bomLineItems.bom_id, requestBomId), eq(bomLineItems.tenant_id, profile.tenantId)))

  const itemLines = lines.filter((l) => l.is_group === 0)
  if (itemLines.length === 0) return { error: 'BOM has no line items' }
  const budgetCodeByBomLine = await approvedBudgetCodesByBomLine(
    db,
    profile.tenantId,
    bom.project_id,
    requestBomId
  )

  // Pull rate cards joined to material_items in this tenant. We pick the
  // cheapest unit_price_cents per (material code, vendor_id) — best-rate
  // vendor wins per code.
  const cards = await db
    .select({
      code: materialItems.code,
      vendor_id: rateCards.vendor_id,
      unit_price_cents: rateCards.unit_price_cents,
    })
    .from(rateCards)
    .innerJoin(materialItems, eq(rateCards.material_item_id, materialItems.id))
    .where(eq(rateCards.tenant_id, profile.tenantId))

  // Pick best (lowest-price) vendor per material code.
  const bestByCode = new Map<string, { vendor_id: string | null; unit_price_cents: number }>()
  for (const c of cards) {
    if (!c.code) continue
    const existing = bestByCode.get(c.code)
    if (!existing || c.unit_price_cents < existing.unit_price_cents) {
      bestByCode.set(c.code, { vendor_id: c.vendor_id, unit_price_cents: c.unit_price_cents })
    }
  }

  // Vendor name lookup for preview rows.
  const vendorRows = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(eq(vendors.tenant_id, profile.tenantId))
  const vendorNameById = new Map(vendorRows.map((v) => [v.id, v.name]))

  // Group lines by best-rate vendor.
  interface Bucket {
    vendorId: string | null
    lines: typeof itemLines
  }
  const buckets = new Map<string, Bucket>()
  for (const line of itemLines) {
    const best = line.code ? bestByCode.get(line.code) : undefined
    const vendorKey = best?.vendor_id ?? 'unassigned'
    const bucket = buckets.get(vendorKey)
    if (bucket) {
      bucket.lines.push(line)
    } else {
      buckets.set(vendorKey, { vendorId: best?.vendor_id ?? null, lines: [line] })
    }
  }

  const groupPreviews: SupplierGroupPreview[] = []
  const bucketsToCreate: Array<{
    bucket: Bucket
    subtotalCents: number
  }> = []

  for (const [key, bucket] of buckets) {
    let subtotalCents: number
    try {
      subtotalCents = bucket.lines.reduce((sum, line) => {
        const next =
          sum + calculateLineTotalCents(line.unit_cost_cents, line.quantity)
        if (!Number.isSafeInteger(next)) {
          throw new RangeError('Subtotal exceeds the supported centavo range')
        }
        return next
      }, 0)
    } catch {
      return { error: 'Purchase Order amount exceeds the supported centavo range' }
    }

    const preview: SupplierGroupPreview = {
      vendor_id: bucket.vendorId,
      vendor_name:
        bucket.vendorId === null
          ? 'Unassigned (no rate card match)'
          : vendorNameById.get(bucket.vendorId) ?? 'Unknown vendor',
      line_count: bucket.lines.length,
      subtotal_cents: subtotalCents,
    }
    groupPreviews.push(preview)

    // Skip the unassigned bucket — surfaced in UI for manual triage.
    if (key === 'unassigned' || bucket.vendorId === null) continue

    bucketsToCreate.push({ bucket, subtotalCents })
  }

  if (bucketsToCreate.length === 0) {
    return { created_po_ids: [], groups: groupPreviews }
  }

  let createdIds: string[]
  try {
    createdIds = await db.transaction(async (tx) => {
      const [lockedBom] = await tx
        .select({ id: boms.id, status: boms.status, project_id: boms.project_id })
        .from(boms)
        .where(and(eq(boms.id, requestBomId), eq(boms.tenant_id, profile.tenantId)))
        .limit(1)
        .for('update')

      if (!lockedBom) throw new Error('BOM_NOT_FOUND')
      if (lockedBom.status !== 'approved') throw new Error('BOM_ALREADY_COMMITTED')

      const ids: string[] = []
      for (const { bucket, subtotalCents } of bucketsToCreate) {
        const totals = calculatePurchaseOrderTotals(subtotalCents)
        const reservedNumber = await allocateNextPurchaseOrderNumber(
          tx,
          profile.tenantId
        )
        const [insertedPo] = await tx
          .insert(purchaseOrders)
          .values({
            tenant_id: profile.tenantId,
            project_id: lockedBom.project_id,
            vendor_id: bucket.vendorId,
            created_by: profile.user.id,
            po_number: reservedNumber,
            status: 'draft',
            subtotal_cents: totals.subtotalCents,
            vat_cents: totals.vatCents,
            withholding_tax_cents: totals.withholdingTaxCents,
            total_cents: totals.totalCents,
          })
          .returning({ id: purchaseOrders.id })

        if (!insertedPo) throw new Error('Failed to create Purchase Order')

        await tx.insert(poLineItems).values(
          bucket.lines.map((l, idx) => ({
            tenant_id: profile.tenantId,
            po_id: insertedPo.id,
            sort_order: idx,
            code: l.code ?? undefined,
            description: l.description,
            unit: l.unit ?? undefined,
            quantity: l.quantity,
            unit_cost_cents: l.unit_cost_cents,
            line_total_cents: calculateLineTotalCents(
              l.unit_cost_cents,
              l.quantity
            ),
            bom_line_item_id: l.id,
            cost_code_id: budgetCodeByBomLine.get(l.id),
          }))
        )

        await writeAuditLogInTransaction(tx, {
          tenantId: profile.tenantId,
          actorId: profile.user.id,
          entityType: 'purchase_order',
          entityId: insertedPo.id,
          action: 'create',
          diff: {
            po_number: reservedNumber,
            bom_id: requestBomId,
            vendor_id: bucket.vendorId,
            line_count: bucket.lines.length,
            source: 'group_by_supplier',
          },
        })

        ids.push(insertedPo.id)
      }

      await tx
        .update(boms)
        .set({ status: 'locked', updated_at: new Date() })
        .where(and(eq(boms.id, requestBomId), eq(boms.tenant_id, profile.tenantId)))

      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'bom',
        entityId: requestBomId,
        action: 'lock',
        diff: {
          reason: 'POs generated by supplier group',
          po_ids: ids,
        },
      })

      return ids
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'BOM_NOT_FOUND') {
      return { error: 'BOM not found' }
    }
    if (error instanceof Error && error.message === 'BOM_ALREADY_COMMITTED') {
      return { error: 'BOM has already been committed to Purchase Orders' }
    }
    return { error: 'Purchase Orders could not be created. Retry after reviewing the BOM.' }
  }

  revalidatePath('/purchase-orders')
  if (bom.project_id) {
    revalidatePath(`/projects/${bom.project_id}`)
    revalidatePath(`/projects/${bom.project_id}/bom`)
  }

  return { created_po_ids: createdIds, groups: groupPreviews }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(val: FormDataEntryValue | null): string | undefined {
  if (typeof val === 'string' && val.trim()) return val.trim()
  return undefined
}

type PurchaseOrderSequenceRow = {
  allocated_value: number | string
}

async function allocateNextPurchaseOrderNumber(
  executor: Pick<Database, 'execute'>,
  tenantId: string
): Promise<string> {
  const rows = await executor.execute<PurchaseOrderSequenceRow>(sql`
    with legacy_max as (
      select coalesce(
        max(substring(po_number from '^PO-([0-9]+)$')::bigint),
        0
      ) as max_value
      from public.purchase_orders
      where tenant_id = ${tenantId}::uuid
    )
    insert into public.financial_sequences (
      tenant_id,
      sequence_key,
      next_value,
      updated_at
    )
    select
      ${tenantId}::uuid,
      ${PURCHASE_ORDER_SEQUENCE_KEY},
      legacy_max.max_value + 2,
      clock_timestamp()
    from legacy_max
    on conflict (tenant_id, sequence_key)
    do update set
      next_value = greatest(
        public.financial_sequences.next_value,
        excluded.next_value - 1
      ) + 1,
      updated_at = clock_timestamp()
    returning next_value - 1 as allocated_value
  `)

  const allocatedValue = Number(rows[0]?.allocated_value)
  return formatPurchaseOrderNumber(allocatedValue)
}

async function approvedBudgetCodesByBomLine(
  executor: Pick<Database, 'select'>,
  tenantId: string,
  projectId: string,
  bomId: string
): Promise<Map<string, string>> {
  const rows = await executor
    .select({
      bomLineItemId: projectBudgetLines.bom_line_item_id,
      costCodeId: projectBudgetLines.cost_code_id,
    })
    .from(projectBudgetLines)
    .innerJoin(
      projectBudgets,
      and(
        eq(projectBudgets.id, projectBudgetLines.project_budget_id),
        eq(projectBudgets.tenant_id, projectBudgetLines.tenant_id)
      )
    )
    .where(
      and(
        eq(projectBudgetLines.tenant_id, tenantId),
        eq(projectBudgets.project_id, projectId),
        eq(projectBudgets.source_bom_id, bomId),
        eq(projectBudgets.status, 'approved')
      )
    )

  return new Map(
    rows.flatMap((row) =>
      row.bomLineItemId
        ? [[row.bomLineItemId, row.costCodeId] as const]
        : []
    )
  )
}
