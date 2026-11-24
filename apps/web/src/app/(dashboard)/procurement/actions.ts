'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { errorChainMessage } from '@/lib/error-chain-message'
import { getUserProfile, requireCapability, can } from '@third-code-erp/auth'
import {
  db,
  liveProjectCondition,
  rateCardInEffectCondition,
  resolveTaxRates,
  unreceivedStockLineCondition,
  type Database,
} from '@third-code-erp/database'
import {
  bomLineItems,
  boms,
  costCodes,
  materialItems,
  poLineItems,
  projectBudgetLines,
  projectBudgets,
  projects,
  purchaseOrders,
  rateCards,
  vendors,
} from '@third-code-erp/database/schema'
import { and, eq, inArray, isNull, not, sql } from 'drizzle-orm'
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
  createPurchaseOrderFromBomThroughCoreApi,
  createPurchaseOrdersGroupedFromBomThroughCoreApi,
  purchaseOrderBomGroupedWritesUseCoreApi,
  purchaseOrderBomWritesUseCoreApi,
  purchaseOrderWorkflowWritesUseCoreApi,
  transitionPurchaseOrderThroughCoreApi,
} from '@/lib/erp-core-client'
import {
  TaxProfileOverlapError,
  canRejectPurchaseOrderApproval,
  purchasableBomLines,
  purchaseLineCostCode,
  purchaseOrderTaxAudit,
  rateCardPicker,
  type PurchaseOrderWorkflowAction,
} from '@third-code-erp/shared-types'
import {
  boqQuantityToMicros,
  manualLineTotal,
} from '@third-code-erp/shared-types/bom'

type CorePurchaseOrderWorkflowAction = PurchaseOrderWorkflowAction

// Spec tenancy AC-TEN-19: overlapping active tax profiles fail the write
// closed; the message names the profiles and the date.
function taxOverlapError(error: unknown): { error: string } | null {
  if (!(error instanceof TaxProfileOverlapError)) return null
  console.error('[tax-rates]', error.message)
  return { error: error.message }
}

async function transitionPurchaseOrderThroughCoreIfEnabled(
  profile: Awaited<ReturnType<typeof getUserProfile>>,
  poId: string,
  projectId: string | null,
  action: CorePurchaseOrderWorkflowAction,
  idempotencyKey?: string,
  reason?: string
): Promise<{ error?: string } | null> {
  if (!profile || !purchaseOrderWorkflowWritesUseCoreApi(profile.tenantId)) {
    return null
  }

  const key =
    typeof idempotencyKey === 'string' && idempotencyKey.trim().length > 0
      ? idempotencyKey.trim()
      : randomUUID()
  const result = await transitionPurchaseOrderThroughCoreApi(
    poId,
    reason ? { action, reason } : { action },
    key
  )
  if (!result.ok || !result.data) {
    return {
      error:
        result.error ??
        'Purchase Order workflow could not be committed through ERP Core.',
    }
  }

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${poId}`)
  if (projectId) revalidatePath(`/projects/${projectId}`)
  return {}
}

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
  deliveryDate: string | null,
  idempotencyKey?: string
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
    })
    .from(boms)
    .where(
      and(
        eq(boms.id, input.bomId),
        eq(boms.tenant_id, userRow.tenant_id),
        liveProjectCondition(boms.project_id, userRow.tenant_id)
      )
    )

  if (!bom) return { error: 'BOM not found' }
  if (bom.status === 'draft') return { error: 'BOM must be approved before generating a PO' }
  if (bom.project_id !== input.projectId) {
    return { error: 'BOM does not belong to the selected project' }
  }

  if (purchaseOrderBomWritesUseCoreApi(profile.tenantId)) {
    const retryKey = idempotencyKey?.trim()
    if (!retryKey) {
      return {
        error: 'Retry token is required for the BOM Purchase Order command.',
      }
    }
    const parsedDeliveryDate = input.deliveryDate
      ? new Date(`${input.deliveryDate}T00:00:00.000Z`)
      : null
    if (parsedDeliveryDate && Number.isNaN(parsedDeliveryDate.getTime())) {
      return { error: 'Delivery date is invalid' }
    }
    const result = await createPurchaseOrderFromBomThroughCoreApi(
      {
        bomId: input.bomId,
        projectId: input.projectId,
        vendorId: input.vendorId,
        deliveryDate: parsedDeliveryDate?.toISOString() ?? null,
        notes: null,
      },
      retryKey
    )
    if (!result.ok || !result.data) {
      return {
        error:
          result.error ??
          'BOM Purchase Order could not be created through ERP Core.',
      }
    }
    revalidatePath('/purchase-orders')
    revalidatePath(`/projects/${input.projectId}`)
    revalidatePath(`/projects/${input.projectId}/bom`)
    return { id: result.data.purchaseOrderId }
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
        })
        .from(boms)
        .where(
          and(
            eq(boms.id, input.bomId),
            eq(boms.tenant_id, userRow.tenant_id),
            liveProjectCondition(boms.project_id, userRow.tenant_id)
          )
        )
        .limit(1)
        .for('update')

      if (!lockedBom) throw new Error('BOM_NOT_FOUND')
      if (lockedBom.status !== 'approved') throw new Error('BOM_ALREADY_COMMITTED')

      // Read source lines only after acquiring the BOM lock. BOM edits that
      // do not lock the parent row must not race this graph copy and produce
      // a PO whose totals and provenance disagree with its source snapshot.
      const rows = await tx
        .select()
        .from(bomLineItems)
        .where(
          and(
            eq(bomLineItems.bom_id, input.bomId),
            eq(bomLineItems.tenant_id, userRow.tenant_id)
          )
        )
        .for('update')
      const lines = purchasableBomLines(rows)
      if (lines.length === 0) throw new Error('BOM_NO_LINES')
      const poLines = lines.map((line) => ({
        line,
        // D-5: half-up round(rate x quantity_decimal), exact.
        lineTotalCents: manualLineTotal(line.unit_cost_cents, line.quantity_decimal),
      }))

      const budgetCodeByBomLine = await approvedBudgetCodesByBomLine(
        tx,
        userRow.tenant_id,
        input.projectId,
        input.bomId
      )

      // Reserve the number and persist the PO graph in one transaction. A
      // failed line insert must not consume a visible Purchase Order number.
      // D-4: the header foots to the PO lines created, not bom.total_cost_cents.
      const tax = await resolveTaxRates(tx, userRow.tenant_id, new Date())
      const totals = calculatePurchaseOrderTotals(
        poLines.reduce((sum, poLine) => sum + poLine.lineTotalCents, 0),
        tax
      )
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

      await tx.insert(poLineItems).values(
        poLines.map(({ line: l, lineTotalCents }, idx) => ({
          tenant_id: userRow.tenant_id,
          po_id: po.id,
          sort_order: idx,
          code: l.code ?? undefined,
          description: l.description,
          unit: l.unit ?? undefined,
          // D-5: legacy integer mirror; the exact quantity is quantity_micros.
          quantity: l.quantity,
          quantity_micros: boqQuantityToMicros(l.quantity_decimal),
          unit_cost_cents: l.unit_cost_cents,
          line_total_cents: lineTotalCents,
          bom_line_item_id: l.id,
          cost_code_id: purchaseLineCostCode(budgetCodeByBomLine, l),
        }))
      )

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
        diff: {
          po_number: reservedNumber,
          bom_id: input.bomId,
          status: 'draft',
          tax: purchaseOrderTaxAudit(tax),
        },
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
    const overlap = taxOverlapError(error)
    if (overlap) return overlap
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

// Retiring a project does not close its POs: goods already ordered can still be
// received, and a PO can still be rejected or cancelled, but not committed further.
const RETIRED_PROJECT_PO_ERROR =
  'This Purchase Order belongs to a retired project; it can only be rejected, cancelled or received.'
// The direct (non-Core) writes change a PO only from the status they read, and the
// forward steps only while its project is live, so a concurrent change or a
// retirement is not overwritten.
const PO_CHANGED_ERROR = 'Purchase Order status changed; reload and try again.'
const UNRECEIVED_PO_ERROR =
  'Every stock-tracked line must be received in full through Stock Receipts before the Purchase Order is marked delivered.'

const VALID_PO_TRANSITIONS: Record<string, string[]> = {
  // Legacy flow — preserved only so existing legacy POs can finish. A draft
  // goes through the approval chain (submit/pm/commercial/scm); starting the
  // legacy route from it would reach `confirmed` without PM or SCM approval.
  draft: ['cancelled'],
  submitted: ['confirmed', 'cancelled'],
  confirmed: ['partial_delivery', 'delivered', 'cancelled'],
  partial_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
  // Three-step delivery tail (REFACTOR.md US-Pre-003). Approval steps
  // themselves use dedicated server actions (submit/pm/commercial/scm),
  // but delivery transitions can go through advancePoStatus. `issued` does not
  // offer the legacy `partial_delivery`: a PO there cannot schedule a delivery (#195).
  issued: ['partial_delivered', 'fully_delivered', 'cancelled'],
  partial_delivered: ['fully_delivered', 'cancelled'],
  fully_delivered: [],
}

const PO_BUDGET_ERRORS = [
  'Blocked budget requires a Cost Code on every PO line',
  'Blocked budget does not contain PO Cost Code',
  'Purchase Order commitment exceeds blocked Cost Code budget',
  'Blocked budget requires a PO line joined to an approved budget line by bom_line_item_id and Cost Code',
  'Blocked budget does not contain PO BOM line budget evidence',
  'Purchase Order commitment exceeds approved budget line allowable',
] as const

function safePoBudgetError(error: unknown): string | null {
  const chain = errorChainMessage(error)
  return PO_BUDGET_ERRORS.find((message) => chain.includes(message)) ?? null
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
        eq(projects.tenant_id, userRow.tenant_id),
        isNull(projects.deleted_at)
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

  const rangeError = 'Purchase Order amount exceeds the supported centavo range'
  let subtotalCents: number
  try {
    subtotalCents = lines.reduce((sum, line) => {
      const next = sum + calculateLineTotalCents(line.unit_cost_cents, line.quantity)
      if (!Number.isSafeInteger(next)) {
        throw new RangeError('Subtotal exceeds the supported centavo range')
      }
      return next
    }, 0)
  } catch {
    return { error: rangeError }
  }

  let poId: string
  try {
    poId = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${
          `po-number:${userRow.tenant_id}`
        }))`
      )
      // Re-check after the PO-number wait; the pre-check ran outside this transaction.
      const [liveProject] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.tenant_id, userRow.tenant_id),
            isNull(projects.deleted_at)
          )
        )
        .limit(1)
      if (!liveProject) throw new Error('PROJECT_NOT_FOUND')
      const tax = await resolveTaxRates(tx, userRow.tenant_id, new Date())
      const totals = calculatePurchaseOrderTotals(subtotalCents, tax)
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
          tax: purchaseOrderTaxAudit(tax),
        },
      })
      return po.id
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      return { error: 'Project not found' }
    }
    const overlap = taxOverlapError(error)
    if (overlap) return overlap
    if (error instanceof RangeError) return { error: rangeError }
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
      projectLive: liveProjectCondition(purchaseOrders.project_id, profile.tenantId).mapWith(Boolean),
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
  if (!line.projectLive) return { error: RETIRED_PROJECT_PO_ERROR }

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

  let saved: boolean
  try {
    saved = await db.transaction(async (tx) => {
      const updated = await tx
        .update(poLineItems)
        .set({ cost_code_id: code.id })
        .where(
          and(
            eq(poLineItems.id, line.id),
            eq(poLineItems.tenant_id, profile.tenantId),
            liveProjectCondition(line.projectId, profile.tenantId)
          )
        )
        .returning({ id: poLineItems.id })
      if (updated.length === 0) return false
      await writeAuditLogInTransaction(tx, {
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
      return true
    })
  } catch {
    // The line guard trigger refuses a PO that left draft, or a Cost Code
    // deactivated, since the reads above; a failed audit rolls the change back.
    return { error: 'Cost Code was not saved; reload and try again.' }
  }
  // Nothing deletes a PO line, so an empty update means the project was retired
  // after the read.
  if (!saved) return { error: RETIRED_PROJECT_PO_ERROR }
  revalidatePath(`/purchase-orders/${line.poId}`)
  if (line.projectId) {
    revalidatePath(`/projects/${line.projectId}/cost`)
    revalidatePath(`/projects/${line.projectId}/cost/budget`)
  }
  return {}
}

// A PO marked delivered must have received every stock-tracked line in full.
const DELIVERED_PO_STATUSES = ['fully_delivered', 'delivered']

export async function advancePoStatus(
  poId: string,
  nextStatus = 'cancelled'
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  try {
    if (nextStatus === 'confirmed') {
      requireCapability(profile, 'po.approve')
    } else {
      requireCapability(profile, 'po.issue')
    }
  } catch {
    return { error: 'You do not have permission to change Purchase Order status.' }
  }

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      status: purchaseOrders.status,
      project_id: purchaseOrders.project_id,
      created_by: purchaseOrders.created_by,
      project_live: liveProjectCondition(purchaseOrders.project_id, profile.tenantId).mapWith(Boolean),
      has_unreceived_stock_line: unreceivedStockLineCondition(
        purchaseOrders.id,
        profile.tenantId
      ).mapWith(Boolean),
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'PO not found' }
  const marksDelivered = DELIVERED_PO_STATUSES.includes(nextStatus)

  const allowed = VALID_PO_TRANSITIONS[po.status] ?? []
  if (!allowed.includes(nextStatus)) {
    return { error: `Cannot transition from ${po.status} to ${nextStatus}` }
  }
  // Legacy `confirmed` is the approval step: the creator cannot approve their own PO.
  if (nextStatus === 'confirmed' && po.created_by === profile.user.id) {
    return { error: 'The Purchase Order creator cannot confirm it' }
  }
  // Checked after status and approvers, as in Core.
  if (nextStatus === 'confirmed' && !po.project_live) {
    return { error: RETIRED_PROJECT_PO_ERROR }
  }
  if (marksDelivered && po.has_unreceived_stock_line) {
    return { error: UNRECEIVED_PO_ERROR }
  }

  try {
    // Conditional on the status read above, so a concurrent change cannot be overwritten.
    const updated = await db
      .update(purchaseOrders)
      .set({ status: nextStatus as typeof purchaseOrders.$inferSelect.status, updated_at: new Date() })
      .where(and(
        eq(purchaseOrders.id, poId),
        eq(purchaseOrders.tenant_id, profile.tenantId),
        eq(purchaseOrders.status, po.status),
        nextStatus === 'confirmed'
          ? liveProjectCondition(purchaseOrders.project_id, profile.tenantId)
          : undefined,
        marksDelivered
          ? not(unreceivedStockLineCondition(purchaseOrders.id, profile.tenantId))
          : undefined
      ))
      .returning({ id: purchaseOrders.id })
    if (updated.length === 0) {
      return { error: PO_CHANGED_ERROR }
    }
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
export async function submitPoForPmApproval(
  poId: string,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  try {
    requireCapability(profile, 'po.create')
  } catch {
    return { error: 'You do not have permission to submit Purchase Orders for PM approval.' }
  }

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      status: purchaseOrders.status,
      project_id: purchaseOrders.project_id,
      po_number: purchaseOrders.po_number,
      project_live: liveProjectCondition(purchaseOrders.project_id, profile.tenantId).mapWith(Boolean),
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'PO not found' }
  if (po.status !== 'draft') return { error: `Cannot submit a PO in status "${po.status}"` }
  // Checked after status and approvers, as in Core.
  if (!po.project_live) return { error: RETIRED_PROJECT_PO_ERROR }

  const coreResult = await transitionPurchaseOrderThroughCoreIfEnabled(
    profile,
    poId,
    po.project_id,
    'submit_pm_approval',
    idempotencyKey
  )
  if (coreResult) return coreResult

  const now = new Date()
  const submitted = await db
    .update(purchaseOrders)
    .set({ status: 'pending_pm_approval', updated_at: now })
    .where(and(
      eq(purchaseOrders.id, poId),
      eq(purchaseOrders.tenant_id, profile.tenantId),
      eq(purchaseOrders.status, po.status),
      liveProjectCondition(purchaseOrders.project_id, profile.tenantId)
    ))
    .returning({ id: purchaseOrders.id })
  if (submitted.length === 0) return { error: PO_CHANGED_ERROR }

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
export async function pmApprovePo(
  poId: string,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  // PM/SD-PM-PE approvers — either po.create OR precon.manage_checklist
  // grants PM-level approval per the spec.
  if (!can(profile.role, 'precon.manage_checklist') && !can(profile.role, 'po.create')) {
    return { error: `Forbidden: role "${profile.role}" cannot approve as PM` }
  }

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      status: purchaseOrders.status,
      project_id: purchaseOrders.project_id,
      po_number: purchaseOrders.po_number,
      created_by: purchaseOrders.created_by,
      pm_approved_by: purchaseOrders.pm_approved_by,
      project_live: liveProjectCondition(purchaseOrders.project_id, profile.tenantId).mapWith(Boolean),
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'PO not found' }
  if (po.status !== 'pending_pm_approval') return { error: `PO not in PM approval state (${po.status})` }
  if (po.created_by === profile.user.id) {
    return { error: 'The Purchase Order creator cannot give its PM approval' }
  }
  // Checked after status and approvers, as in Core.
  if (!po.project_live) return { error: RETIRED_PROJECT_PO_ERROR }

  const coreResult = await transitionPurchaseOrderThroughCoreIfEnabled(
    profile,
    poId,
    po.project_id,
    'pm_approve',
    idempotencyKey
  )
  if (coreResult) return coreResult

  const now = new Date()
  const pmApproved = await db
    .update(purchaseOrders)
    .set({
      status: 'pending_commercial_approval',
      pm_approved_at: now,
      pm_approved_by: profile.user.id,
      updated_at: now,
    })
    .where(and(
      eq(purchaseOrders.id, poId),
      eq(purchaseOrders.tenant_id, profile.tenantId),
      eq(purchaseOrders.status, po.status),
      liveProjectCondition(purchaseOrders.project_id, profile.tenantId)
    ))
    .returning({ id: purchaseOrders.id })
  if (pmApproved.length === 0) return { error: PO_CHANGED_ERROR }

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
export async function commercialApprovePo(
  poId: string,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  try {
    requireCapability(profile, 'po.approve')
  } catch {
    return { error: 'You do not have permission to approve Purchase Orders commercially.' }
  }

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      status: purchaseOrders.status,
      project_id: purchaseOrders.project_id,
      po_number: purchaseOrders.po_number,
      created_by: purchaseOrders.created_by,
      pm_approved_by: purchaseOrders.pm_approved_by,
      project_live: liveProjectCondition(purchaseOrders.project_id, profile.tenantId).mapWith(Boolean),
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'PO not found' }
  if (po.status !== 'pending_commercial_approval') {
    return { error: `PO not in Commercial approval state (${po.status})` }
  }
  if (po.created_by === profile.user.id || po.pm_approved_by === profile.user.id) {
    return {
      error:
        'Commercial approval must come from someone other than the Purchase Order creator and PM approver',
    }
  }
  // Checked after status and approvers, as in Core.
  if (!po.project_live) return { error: RETIRED_PROJECT_PO_ERROR }

  const coreResult = await transitionPurchaseOrderThroughCoreIfEnabled(
    profile,
    poId,
    po.project_id,
    'commercial_approve',
    idempotencyKey
  )
  if (coreResult) return coreResult

  const now = new Date()
  const commercialApproved = await db
    .update(purchaseOrders)
    .set({
      status: 'pending_scm_issuance',
      commercial_approved_at: now,
      commercial_approved_by: profile.user.id,
      updated_at: now,
    })
    .where(and(
      eq(purchaseOrders.id, poId),
      eq(purchaseOrders.tenant_id, profile.tenantId),
      eq(purchaseOrders.status, po.status),
      liveProjectCondition(purchaseOrders.project_id, profile.tenantId)
    ))
    .returning({ id: purchaseOrders.id })
  if (commercialApproved.length === 0) return { error: PO_CHANGED_ERROR }

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
export async function scmIssuePo(
  poId: string,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  try {
    requireCapability(profile, 'po.issue')
  } catch {
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
      project_live: liveProjectCondition(purchaseOrders.project_id, profile.tenantId).mapWith(Boolean),
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
  // Checked after status and approvers, as in Core.
  if (!po.project_live) return { error: RETIRED_PROJECT_PO_ERROR }

  const coreResult = await transitionPurchaseOrderThroughCoreIfEnabled(
    profile,
    poId,
    po.project_id,
    'scm_issue',
    idempotencyKey
  )
  if (coreResult) return coreResult

  const now = new Date()
  let supplierEmailSent = false

  let issued: { id: string }[]
  try {
    issued = await db
      .update(purchaseOrders)
      .set({
        status: 'issued',
        scm_issued_at: now,
        scm_issued_by: profile.user.id,
        updated_at: now,
      })
      .where(and(
        eq(purchaseOrders.id, poId),
        eq(purchaseOrders.tenant_id, profile.tenantId),
        eq(purchaseOrders.status, po.status),
        liveProjectCondition(purchaseOrders.project_id, profile.tenantId)
      ))
      .returning({ id: purchaseOrders.id })
  } catch (error) {
    return {
      error:
        safePoBudgetError(error) ??
        'Purchase Order could not be issued.',
    }
  }
  if (issued.length === 0) return { error: PO_CHANGED_ERROR }

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

          console.error('PO supplier email evidence stamp failed', stampError)
        }
      }
    } catch (err: unknown) {
      // Email dispatch failures should not block status advance — log
      // Issuance stays committed; operators can resolve delivery separately.

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
  reason: string,
  idempotencyKey?: string
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

  if (!canRejectPurchaseOrderApproval(po.status, profile.role)) {
    return { error: `Forbidden: role "${profile.role}" cannot reject at step "${po.status}"` }
  }

  const coreResult = await transitionPurchaseOrderThroughCoreIfEnabled(
    profile,
    poId,
    po.project_id,
    'reject',
    idempotencyKey,
    trimmed
  )
  if (coreResult) return coreResult

  const now = new Date()
  const rejected = await db
    .update(purchaseOrders)
    .set({ status: 'draft', updated_at: now })
    .where(and(
      eq(purchaseOrders.id, poId),
      eq(purchaseOrders.tenant_id, profile.tenantId),
      eq(purchaseOrders.status, po.status)
    ))
    .returning({ id: purchaseOrders.id })
  if (rejected.length === 0) return { error: PO_CHANGED_ERROR }

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
  bomId: string,
  idempotencyKey?: string
): Promise<GroupedPoResult | { error: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  const parsedInput = createGroupedPoFromBomInputSchema.safeParse({ bomId })
  if (!parsedInput.success) return { error: 'Invalid Purchase Order input' }
  const requestBomId = parsedInput.data.bomId

  try {
    requireCapability(profile, 'po.create')
  } catch {
    return { error: 'You do not have permission to create grouped Purchase Orders.' }
  }

  const [bom] = await db
    .select({
      id: boms.id,
      status: boms.status,
      project_id: boms.project_id,
    })
    .from(boms)
    .where(
      and(
        eq(boms.id, requestBomId),
        eq(boms.tenant_id, profile.tenantId),
        liveProjectCondition(boms.project_id, profile.tenantId)
      )
    )

  if (!bom) return { error: 'BOM not found' }
  if (bom.status === 'draft') {
    return { error: 'BOM must be approved before generating POs' }
  }

  if (purchaseOrderBomGroupedWritesUseCoreApi(profile.tenantId)) {
    const retryKey = idempotencyKey?.trim()
    if (!retryKey) {
      return {
        error:
          'Retry token is required for the grouped BOM Purchase Order command.',
      }
    }
    const result = await createPurchaseOrdersGroupedFromBomThroughCoreApi(
      { bomId: requestBomId },
      retryKey
    )
    if (!result.ok || !result.data) {
      return {
        error:
          result.error ??
          'Grouped BOM Purchase Orders could not be created through ERP Core.',
      }
    }
    revalidatePath('/purchase-orders')
    if (bom.project_id) {
      revalidatePath(`/projects/${bom.project_id}`)
      revalidatePath(`/projects/${bom.project_id}/bom`)
    }
    return {
      created_po_ids: result.data.purchaseOrderIds,
      groups: result.data.groups.map((group) => ({
        vendor_id: group.vendorId,
        vendor_name: group.vendorName,
        line_count: group.lineCount,
        subtotal_cents: group.subtotalCents,
      })),
    }
  }

  let outcome: GroupedPoResult
  try {
    outcome = await db.transaction(async (tx) => {
      // Lock the BOM before reading its lines and rate cards, so the supplier
      // grouping and the Purchase Orders come from one snapshot.
      const [lockedBom] = await tx
        .select({ id: boms.id, status: boms.status, project_id: boms.project_id })
        .from(boms)
        .where(
          and(
            eq(boms.id, requestBomId),
            eq(boms.tenant_id, profile.tenantId),
            liveProjectCondition(boms.project_id, profile.tenantId)
          )
        )
        .limit(1)
        .for('update')

      if (!lockedBom) throw new Error('BOM_NOT_FOUND')

      // Only the leaf rows are bought (D-4).
      const lines = await tx
        .select()
        .from(bomLineItems)
        .where(
          and(
            eq(bomLineItems.bom_id, requestBomId),
            eq(bomLineItems.tenant_id, profile.tenantId)
          )
        )
        .for('update')
      const itemLines = purchasableBomLines(lines)
      if (itemLines.length === 0) throw new Error('BOM_NO_LINES')
      const budgetCodeByBomLine = await approvedBudgetCodesByBomLine(
        tx,
        profile.tenantId,
        lockedBom.project_id,
        requestBomId
      )

      // Current, positive-price rate cards on this tenant's material items.
      // Card choice must stay in step with RFQ coverage (`loadRateCardCoverage`).
      const now = new Date()
      const cards = await tx
        .select({
          id: rateCards.id,
          code: materialItems.code,
          unit: materialItems.unit,
          vendorId: rateCards.vendor_id,
          unitPriceCents: rateCards.unit_price_cents,
          effectiveFrom: rateCards.effective_from,
          effectiveTo: rateCards.effective_to,
        })
        .from(rateCards)
        .innerJoin(
          materialItems,
          and(
            eq(rateCards.material_item_id, materialItems.id),
            eq(materialItems.tenant_id, profile.tenantId)
          )
        )
        .where(
          and(
            eq(rateCards.tenant_id, profile.tenantId),
            rateCardInEffectCondition(now)
          )
        )
        .orderBy(rateCards.unit_price_cents, rateCards.id)
        .for('share')

      const candidateVendorIds = [
        ...new Set(cards.flatMap((card) => (card.vendorId ? [card.vendorId] : []))),
      ]
      const vendorRows = candidateVendorIds.length
        ? await tx
            .select({ id: vendors.id, name: vendors.name })
            .from(vendors)
            .where(
              and(
                eq(vendors.tenant_id, profile.tenantId),
                inArray(vendors.id, candidateVendorIds)
              )
            )
            .for('share')
        : []
      const vendorNameById = new Map(vendorRows.map((v) => [v.id, v.name]))
      const pickRateCard = rateCardPicker(cards, new Set(vendorNameById.keys()), now)

      // Group lines by best-rate vendor.
      interface Bucket {
        vendorId: string | null
        lines: typeof itemLines
      }
      const buckets = new Map<string, Bucket>()
      for (const line of itemLines) {
        const best = pickRateCard(line)
        const vendorId = best?.vendorId ?? null
        // D-4: the rate card that chose the vendor also prices the line.
        const pricedLine =
          best && vendorId ? { ...line, unit_cost_cents: best.unitPriceCents } : line
        const vendorKey = vendorId ?? 'unassigned'
        const bucket = buckets.get(vendorKey)
        if (bucket) {
          bucket.lines.push(pricedLine)
        } else {
          buckets.set(vendorKey, { vendorId, lines: [pricedLine] })
        }
      }

      const groupPreviews: SupplierGroupPreview[] = []
      const bucketsToCreate: Array<{ bucket: Bucket; subtotalCents: number }> = []
      for (const [key, bucket] of buckets) {
        const subtotalCents = bucket.lines.reduce((sum, line) => {
          const next = sum + manualLineTotal(line.unit_cost_cents, line.quantity_decimal)
          if (!Number.isSafeInteger(next)) {
            throw new RangeError('Subtotal exceeds the supported centavo range')
          }
          return next
        }, 0)

        groupPreviews.push({
          vendor_id: bucket.vendorId,
          vendor_name:
            bucket.vendorId === null
              ? 'Unassigned (no rate card match)'
              : vendorNameById.get(bucket.vendorId) ?? 'Unknown vendor',
          line_count: bucket.lines.length,
          subtotal_cents: subtotalCents,
        })

        // Skip the unassigned bucket — surfaced in UI for manual triage.
        if (key === 'unassigned' || bucket.vendorId === null) continue

        bucketsToCreate.push({ bucket, subtotalCents })
      }

      if (bucketsToCreate.length === 0) {
        return { created_po_ids: [], groups: groupPreviews }
      }
      if (lockedBom.status !== 'approved') throw new Error('BOM_ALREADY_COMMITTED')

      const tax = await resolveTaxRates(tx, profile.tenantId, now)
      const ids: string[] = []
      for (const { bucket, subtotalCents } of bucketsToCreate) {
        const totals = calculatePurchaseOrderTotals(subtotalCents, tax)
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
            // D-5: legacy integer mirror; the exact quantity is quantity_micros.
            quantity: l.quantity,
            quantity_micros: boqQuantityToMicros(l.quantity_decimal),
            unit_cost_cents: l.unit_cost_cents,
            line_total_cents: manualLineTotal(l.unit_cost_cents, l.quantity_decimal),
            bom_line_item_id: l.id,
            cost_code_id: purchaseLineCostCode(budgetCodeByBomLine, l),
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
            tax: purchaseOrderTaxAudit(tax),
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

      return { created_po_ids: ids, groups: groupPreviews }
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'BOM_NOT_FOUND') {
      return { error: 'BOM not found' }
    }
    if (error instanceof Error && error.message === 'BOM_ALREADY_COMMITTED') {
      return { error: 'BOM has already been committed to Purchase Orders' }
    }
    if (error instanceof Error && error.message === 'BOM_NO_LINES') {
      return { error: 'BOM has no line items' }
    }
    const overlap = taxOverlapError(error)
    if (overlap) return overlap
    if (error instanceof RangeError) {
      return { error: 'Purchase Order amount exceeds the supported centavo range' }
    }
    return { error: 'Purchase Orders could not be created. Retry after reviewing the BOM.' }
  }

  if (outcome.created_po_ids.length > 0) {
    revalidatePath('/purchase-orders')
    if (bom.project_id) {
      revalidatePath(`/projects/${bom.project_id}`)
      revalidatePath(`/projects/${bom.project_id}/bom`)
    }
  }

  return outcome
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
