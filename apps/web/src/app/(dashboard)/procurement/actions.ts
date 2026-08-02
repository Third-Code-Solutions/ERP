'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getUserProfile, requireCapability, can, type AppRole } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
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
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'
import {
  createPurchaseOrderThroughCoreApi,
  purchaseOrderWritesUseCoreApi,
  purchaseOrderWorkflowWritesUseCoreApi,
  transitionPurchaseOrderThroughCoreApi,
} from '@/lib/erp-core-client'
import { notifyRoles, notifyExternalEmail } from '@/lib/operations/notifications'
import type {
  CreatePurchaseOrderCommand,
  PurchaseOrderWorkflowAction,
} from '@third-code-erp/shared-types'
import {
  computeEWT,
  computeRetention,
  computeVAT,
  progressBillingAmount,
} from '@third-code-erp/shared-types/bom'

type PoCapability = 'po.create' | 'po.approve' | 'po.issue' | 'po.receive'

type CorePurchaseOrderWorkflowAction = PurchaseOrderWorkflowAction

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

function missingPoCapability(
  role: AppRole,
  capability: PoCapability
): string | null {
  return can(role, capability)
    ? null
    : `Forbidden: role "${role}" lacks capability "${capability}"`
}

function missingAnyPoCapability(
  role: AppRole,
  capabilities: readonly PoCapability[]
): string | null {
  return capabilities.some((capability) => can(role, capability))
    ? null
    : `Forbidden: role "${role}" cannot perform this Purchase Order action`
}

// ── Vendor ────────────────────────────────────────────────────────────────────

export async function createVendor(formData: FormData): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  const capabilityError = missingPoCapability(profile.role, 'po.create')
  if (capabilityError) return { error: capabilityError }

  const name = formData.get('name')
  if (typeof name !== 'string' || !name.trim()) return { error: 'Vendor name is required' }

  const [inserted] = await db
    .insert(vendors)
    .values({
      tenant_id: profile.tenantId,
      name: name.trim(),
      contact_name: str(formData.get('contact_name')),
      email: str(formData.get('email')),
      phone: str(formData.get('phone')),
      bir_tin: str(formData.get('bir_tin')),
      address: str(formData.get('address')),
      notes: str(formData.get('notes')),
    })
    .returning({ id: vendors.id })

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'vendor',
    entityId: inserted!.id,
    action: 'create',
    diff: { name },
  })

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
  const capabilityError = missingPoCapability(profile.role, 'po.create')
  if (capabilityError) return { error: capabilityError }

  // Verify BOM is approved or locked
  const [bom] = await db
    .select({
      id: boms.id,
      status: boms.status,
      total_cost_cents: boms.total_cost_cents,
      project_id: boms.project_id,
    })
    .from(boms)
    .where(and(eq(boms.id, bomId), eq(boms.tenant_id, profile.tenantId)))

  if (!bom) return { error: 'BOM not found' }
  if (bom.status === 'draft') return { error: 'BOM must be approved before generating a PO' }
  if (bom.project_id !== projectId) {
    return { error: 'BOM belongs to a different project' }
  }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)
  if (!project) return { error: 'Project not found' }

  if (vendorId) {
    const [vendor] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.id, vendorId), eq(vendors.tenant_id, profile.tenantId)))
      .limit(1)
    if (!vendor) return { error: 'Vendor not found' }
  }

  // Generate sequential PO number
  const [existing] = await db
    .select({ max_po: max(purchaseOrders.po_number) })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.tenant_id, profile.tenantId))

  const nextNum = nextPoNumber(existing?.max_po ?? null)

  const subtotalCents = bom.total_cost_cents
  const vatCents = Math.round(subtotalCents * 0.12)
  const withholdingTaxCents = Math.round(subtotalCents * 0.02)
  const totalCents = subtotalCents + vatCents - withholdingTaxCents

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      tenant_id: profile.tenantId,
      project_id: projectId,
      vendor_id: vendorId ?? undefined,
      created_by: profile.user.id,
      po_number: nextNum,
      status: 'draft',
      subtotal_cents: subtotalCents,
      vat_cents: vatCents,
      withholding_tax_cents: withholdingTaxCents,
      total_cents: totalCents,
      delivery_date: deliveryDate ? new Date(deliveryDate) : undefined,
    })
    .returning({ id: purchaseOrders.id })

  const poId = po!.id

  // Copy BOM line items → PO line items
  const lines = await db
    .select()
    .from(bomLineItems)
    .where(and(eq(bomLineItems.bom_id, bomId), eq(bomLineItems.tenant_id, profile.tenantId)))
  const budgetCodeByBomLine = await approvedBudgetCodesByBomLine(
    profile.tenantId,
    projectId,
    bomId
  )

  if (lines.length > 0) {
    await db.insert(poLineItems).values(
      lines.map((l, idx) => ({
        tenant_id: profile.tenantId,
        po_id: poId,
        sort_order: idx,
        code: l.code ?? undefined,
        description: l.description,
        unit: l.unit ?? undefined,
        quantity: l.quantity,
        unit_cost_cents: l.unit_cost_cents,
        line_total_cents: l.unit_cost_cents * l.quantity,
        bom_line_item_id: l.id,
        cost_code_id: budgetCodeByBomLine.get(l.id),
      }))
    )
  }

  // Auto-lock BOM once a PO is generated
  if (bom.status === 'approved') {
    await db
      .update(boms)
      .set({ status: 'locked', updated_at: new Date() })
      .where(and(eq(boms.id, bomId), eq(boms.tenant_id, profile.tenantId)))

    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'bom',
      entityId: bomId,
      action: 'lock',
      diff: { reason: 'PO generated', po_id: poId },
    })
  }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'purchase_order',
    entityId: poId,
    action: 'create',
    diff: { po_number: nextNum, bom_id: bomId, status: 'draft' },
  })

  revalidatePath(`/projects/${projectId}/bom`)
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

interface LineItemInput {
  description: string
  code?: string
  unit?: string
  quantity: number
  unit_cost_cents: number
  costCodeId: string
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
  const capabilityError = missingPoCapability(profile.role, 'po.create')
  if (capabilityError) return { error: capabilityError }

  const projectId = str(formData.get('project_id'))
  if (!projectId) return { error: 'Project is required' }

  const vendorId = str(formData.get('vendor_id'))
  const deliveryDate = str(formData.get('delivery_date'))
  const notes = str(formData.get('notes'))

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)
  if (!project) return { error: 'Project not found' }

  if (vendorId) {
    const [vendor] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.id, vendorId), eq(vendors.tenant_id, profile.tenantId)))
      .limit(1)
    if (!vendor) return { error: 'Vendor not found' }
  }

  let lines: LineItemInput[] = []
  try {
    const raw = formData.get('line_items')
    const parsed: unknown = raw ? JSON.parse(String(raw)) : []
    if (!Array.isArray(parsed)) return { error: 'Invalid line items' }
    lines = parsed as LineItemInput[]
  } catch {
    return { error: 'Invalid line items' }
  }

  if (lines.length === 0) return { error: 'At least one line item is required' }
  if (
    lines.some(
      (line) =>
        !line ||
        typeof line !== 'object' ||
        typeof line.description !== 'string' ||
        !line.description.trim() ||
        !Number.isInteger(line.quantity) ||
        line.quantity <= 0 ||
        !Number.isInteger(line.unit_cost_cents) ||
        line.unit_cost_cents < 0 ||
        typeof line.costCodeId !== 'string'
    )
  ) {
    return { error: 'Line items must contain positive integer quantities and centavo prices' }
  }
  if (lines.some((line) => !line.costCodeId)) {
    return { error: 'Every Purchase Order line requires a Cost Code' }
  }

  if (purchaseOrderWritesUseCoreApi(profile.tenantId)) {
    const idempotencyKey = str(formData.get('idempotency_key'))
    if (!idempotencyKey) {
      return {
        error: 'Retry token is required for the Purchase Order command.',
      }
    }
    const parsedDeliveryDate = deliveryDate
      ? new Date(`${deliveryDate}T00:00:00.000Z`)
      : null
    if (parsedDeliveryDate && Number.isNaN(parsedDeliveryDate.getTime())) {
      return { error: 'Delivery date is invalid' }
    }
    const command: CreatePurchaseOrderCommand = {
      projectId,
      vendorId: vendorId ?? null,
      deliveryDate: parsedDeliveryDate?.toISOString() ?? null,
      notes: notes ?? null,
      lines: lines.map((line) => ({
        code: line.code || undefined,
        description: line.description.trim(),
        unit: line.unit || undefined,
        quantity: line.quantity,
        unitCostCents: line.unit_cost_cents,
        costCodeId: line.costCodeId,
      })),
    }
    const result = await createPurchaseOrderThroughCoreApi(
      command,
      idempotencyKey
    )
    if (!result.ok || !result.data) {
      return {
        error:
          result.error ??
          'Purchase Order could not be created through ERP Core.',
      }
    }
    revalidatePath('/purchase-orders')
    return { id: result.data.purchaseOrderId }
  }

  const selectedCodeIds = [...new Set(lines.map((line) => line.costCodeId))]
  const selectedCodes = await db
    .select({ id: costCodes.id })
    .from(costCodes)
    .where(
      and(
        eq(costCodes.tenant_id, profile.tenantId),
        eq(costCodes.is_active, true),
        inArray(costCodes.id, selectedCodeIds)
      )
    )
  if (selectedCodes.length !== selectedCodeIds.length) {
    return { error: 'Every Purchase Order line requires an active Cost Code' }
  }

  const subtotalCents = lines.reduce((s, l) => s + l.unit_cost_cents * l.quantity, 0)
  const vatCents = Math.round(subtotalCents * 0.12)
  const withholdingTaxCents = Math.round(subtotalCents * 0.02)
  const totalCents = subtotalCents + vatCents - withholdingTaxCents

  let poId: string
  try {
    poId = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${
          `po-number:${profile.tenantId}`
        }))`
      )
      const [existing] = await tx
        .select({ max_po: max(purchaseOrders.po_number) })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.tenant_id, profile.tenantId))

      const [po] = await tx
        .insert(purchaseOrders)
        .values({
          tenant_id: profile.tenantId,
          project_id: projectId,
          vendor_id: vendorId ?? undefined,
          created_by: profile.user.id,
          po_number: nextPoNumber(existing?.max_po ?? null),
          status: 'draft',
          subtotal_cents: subtotalCents,
          vat_cents: vatCents,
          withholding_tax_cents: withholdingTaxCents,
          total_cents: totalCents,
          delivery_date: deliveryDate ? new Date(deliveryDate) : undefined,
          notes,
        })
        .returning({ id: purchaseOrders.id })
      if (!po) throw new Error('Failed to create Purchase Order')

      await tx.insert(poLineItems).values(
        lines.map((l, idx) => ({
          tenant_id: profile.tenantId,
          po_id: po.id,
          sort_order: idx,
          code: l.code || undefined,
          description: l.description,
          unit: l.unit || undefined,
          quantity: l.quantity,
          unit_cost_cents: l.unit_cost_cents,
          line_total_cents: l.unit_cost_cents * l.quantity,
          cost_code_id: l.costCodeId,
        }))
      )
      return po.id
    })
  } catch (error) {
    return {
      error:
        safePoBudgetError(error) ??
        'Purchase Order could not be created. Review the line evidence and retry.',
    }
  }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'purchase_order',
    entityId: poId,
    action: 'create',
    diff: { project_id: projectId, vendor_id: vendorId, subtotal_cents: subtotalCents },
  })

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

  const requiredCapabilities: readonly PoCapability[] =
    nextStatus === 'confirmed'
      ? ['po.approve']
      : ['partial_delivery', 'delivered', 'partial_delivered', 'fully_delivered'].includes(nextStatus)
        ? ['po.receive']
        : nextStatus === 'cancelled'
          ? ['po.create', 'po.approve', 'po.issue']
          : ['po.create']
  const capabilityError = missingAnyPoCapability(profile.role, requiredCapabilities)
  if (capabilityError) return { error: capabilityError }

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
  const capabilityError = missingPoCapability(profile.role, 'po.receive')
  if (capabilityError) return { error: capabilityError }

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
    .where(eq(poLineItems.id, lineId))

  if (!line) return { error: 'Line item not found' }
  if (line.tenant_id !== profile.tenantId) return { error: 'Line item not found' }

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
    return {
      error: error instanceof Error ? error.message : 'Forbidden',
    }
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
export async function submitPoForPmApproval(
  poId: string,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  try {
    requireCapability(profile, 'po.create')
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Forbidden' }
  }

  const [po] = await db
    .select({ id: purchaseOrders.id, status: purchaseOrders.status, project_id: purchaseOrders.project_id, po_number: purchaseOrders.po_number })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'PO not found' }
  if (po.status !== 'draft') return { error: `Cannot submit a PO in status "${po.status}"` }

  const coreResult = await transitionPurchaseOrderThroughCoreIfEnabled(
    profile,
    poId,
    po.project_id,
    'submit_pm_approval',
    idempotencyKey
  )
  if (coreResult) return coreResult

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
    .select({ id: purchaseOrders.id, status: purchaseOrders.status, project_id: purchaseOrders.project_id, po_number: purchaseOrders.po_number })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'PO not found' }
  if (po.status !== 'pending_pm_approval') return { error: `PO not in PM approval state (${po.status})` }

  const coreResult = await transitionPurchaseOrderThroughCoreIfEnabled(
    profile,
    poId,
    po.project_id,
    'pm_approve',
    idempotencyKey
  )
  if (coreResult) return coreResult

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
export async function commercialApprovePo(
  poId: string,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  try {
    requireCapability(profile, 'po.approve')
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Forbidden' }
  }

  const [po] = await db
    .select({ id: purchaseOrders.id, status: purchaseOrders.status, project_id: purchaseOrders.project_id, po_number: purchaseOrders.po_number })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'PO not found' }
  if (po.status !== 'pending_commercial_approval') {
    return { error: `PO not in Commercial approval state (${po.status})` }
  }

  const coreResult = await transitionPurchaseOrderThroughCoreIfEnabled(
    profile,
    poId,
    po.project_id,
    'commercial_approve',
    idempotencyKey
  )
  if (coreResult) return coreResult

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
export async function scmIssuePo(
  poId: string,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  try {
    requireCapability(profile, 'po.issue')
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Forbidden' }
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
    .leftJoin(vendors, eq(purchaseOrders.vendor_id, vendors.id))
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, profile.tenantId)))

  if (!po) return { error: 'PO not found' }
  if (po.status !== 'pending_scm_issuance') {
    return { error: `PO not in SCM issuance state (${po.status})` }
  }

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
      await notifyExternalEmail({
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
      supplierEmailSent = true
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

  try {
    requireCapability(profile, 'po.create')
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Forbidden' }
  }

  const [bom] = await db
    .select({
      id: boms.id,
      status: boms.status,
      project_id: boms.project_id,
    })
    .from(boms)
    .where(and(eq(boms.id, bomId), eq(boms.tenant_id, profile.tenantId)))

  if (!bom) return { error: 'BOM not found' }
  if (bom.status === 'draft') {
    return { error: 'BOM must be approved before generating POs' }
  }

  // Pull lines for this BOM (excluding group headers)
  const lines = await db
    .select()
    .from(bomLineItems)
    .where(and(eq(bomLineItems.bom_id, bomId), eq(bomLineItems.tenant_id, profile.tenantId)))

  const itemLines = lines.filter((l) => l.is_group === 0)
  if (itemLines.length === 0) return { error: 'BOM has no line items' }
  const budgetCodeByBomLine = await approvedBudgetCodesByBomLine(
    profile.tenantId,
    bom.project_id,
    bomId
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

  // Auto-lock BOM as we're committing to a PO set.
  if (bom.status === 'approved') {
    await db
      .update(boms)
      .set({ status: 'locked', updated_at: new Date() })
      .where(and(eq(boms.id, bomId), eq(boms.tenant_id, profile.tenantId)))
  }

  const [existing] = await db
    .select({ max_po: max(purchaseOrders.po_number) })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.tenant_id, profile.tenantId))

  let lastPoNumber = existing?.max_po ?? null
  const createdIds: string[] = []
  const groupPreviews: SupplierGroupPreview[] = []

  for (const [key, bucket] of buckets) {
    const subtotalCents = bucket.lines.reduce(
      (s, l) => s + l.unit_cost_cents * l.quantity,
      0
    )

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

    const vatCents = Math.round(subtotalCents * 0.12)
    const withholdingTaxCents = Math.round(subtotalCents * 0.02)
    const totalCents = subtotalCents + vatCents - withholdingTaxCents

    const nextNum = nextPoNumber(lastPoNumber)
    lastPoNumber = nextNum

    const [po] = await db
      .insert(purchaseOrders)
      .values({
        tenant_id: profile.tenantId,
        project_id: bom.project_id,
        vendor_id: bucket.vendorId,
        created_by: profile.user.id,
        po_number: nextNum,
        status: 'draft',
        subtotal_cents: subtotalCents,
        vat_cents: vatCents,
        withholding_tax_cents: withholdingTaxCents,
        total_cents: totalCents,
      })
      .returning({ id: purchaseOrders.id })

    const poId = po!.id
    createdIds.push(poId)

    await db.insert(poLineItems).values(
      bucket.lines.map((l, idx) => ({
        tenant_id: profile.tenantId,
        po_id: poId,
        sort_order: idx,
        code: l.code ?? undefined,
        description: l.description,
        unit: l.unit ?? undefined,
        quantity: l.quantity,
        unit_cost_cents: l.unit_cost_cents,
        line_total_cents: l.unit_cost_cents * l.quantity,
        bom_line_item_id: l.id,
        cost_code_id: budgetCodeByBomLine.get(l.id),
      }))
    )

    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'purchase_order',
      entityId: poId,
      action: 'create',
      diff: {
        po_number: nextNum,
        bom_id: bomId,
        vendor_id: bucket.vendorId,
        line_count: bucket.lines.length,
        source: 'group_by_supplier',
      },
    })
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

function nextPoNumber(last: string | null): string {
  if (!last) return 'PO-0001'
  const match = last.match(/(\d+)$/)
  if (!match) return 'PO-0001'
  const n = parseInt(match[1]!, 10) + 1
  return `PO-${String(n).padStart(4, '0')}`
}

async function approvedBudgetCodesByBomLine(
  tenantId: string,
  projectId: string,
  bomId: string
): Promise<Map<string, string>> {
  const rows = await db
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
