'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { bomLineItems, boms, poLineItems, purchaseOrders, users, vendors } from '@buildops/database/schema'
import { and, eq, max } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'

// ── Vendor ────────────────────────────────────────────────────────────────────

export async function createVendor(formData: FormData): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  const name = formData.get('name')
  if (typeof name !== 'string' || !name.trim()) return { error: 'Vendor name is required' }

  const [inserted] = await db
    .insert(vendors)
    .values({
      tenant_id: userRow.tenant_id,
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
    tenantId: userRow.tenant_id,
    actorId: user.id,
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
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  // Verify BOM is approved or locked
  const [bom] = await db
    .select({ id: boms.id, status: boms.status, total_cost_cents: boms.total_cost_cents })
    .from(boms)
    .where(and(eq(boms.id, bomId), eq(boms.tenant_id, userRow.tenant_id)))

  if (!bom) return { error: 'BOM not found' }
  if (bom.status === 'draft') return { error: 'BOM must be approved before generating a PO' }

  // Generate sequential PO number
  const [existing] = await db
    .select({ max_po: max(purchaseOrders.po_number) })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.tenant_id, userRow.tenant_id))

  const nextNum = nextPoNumber(existing?.max_po ?? null)

  const subtotalCents = bom.total_cost_cents
  const vatCents = Math.round(subtotalCents * 0.12)
  const withholdingTaxCents = Math.round(subtotalCents * 0.02)
  const totalCents = subtotalCents + vatCents - withholdingTaxCents

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      tenant_id: userRow.tenant_id,
      project_id: projectId,
      vendor_id: vendorId ?? undefined,
      created_by: user.id,
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
    .where(and(eq(bomLineItems.bom_id, bomId), eq(bomLineItems.tenant_id, userRow.tenant_id)))

  if (lines.length > 0) {
    await db.insert(poLineItems).values(
      lines.map((l, idx) => ({
        tenant_id: userRow.tenant_id,
        po_id: poId,
        sort_order: idx,
        code: l.code ?? undefined,
        description: l.description,
        unit: l.unit ?? undefined,
        quantity: l.quantity,
        unit_cost_cents: l.unit_cost_cents,
        line_total_cents: l.unit_cost_cents * l.quantity,
      }))
    )
  }

  // Auto-lock BOM once a PO is generated
  if (bom.status === 'approved') {
    await db
      .update(boms)
      .set({ status: 'locked', updated_at: new Date() })
      .where(and(eq(boms.id, bomId), eq(boms.tenant_id, userRow.tenant_id)))

    await writeAuditLog({
      tenantId: userRow.tenant_id,
      actorId: user.id,
      entityType: 'bom',
      entityId: bomId,
      action: 'lock',
      diff: { reason: 'PO generated', po_id: poId },
    })
  }

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
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
  draft: ['submitted', 'cancelled'],
  submitted: ['confirmed', 'cancelled'],
  confirmed: ['partial_delivery', 'delivered', 'cancelled'],
  partial_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

interface LineItemInput {
  description: string
  code?: string
  unit?: string
  quantity: number
  unit_cost_cents: number
}

export async function createStandalonePo(
  formData: FormData
): Promise<{ id: string } | { error: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  const projectId = str(formData.get('project_id'))
  if (!projectId) return { error: 'Project is required' }

  const vendorId = str(formData.get('vendor_id'))
  const deliveryDate = str(formData.get('delivery_date'))
  const notes = str(formData.get('notes'))

  let lines: LineItemInput[] = []
  try {
    const raw = formData.get('line_items')
    lines = raw ? (JSON.parse(String(raw)) as LineItemInput[]) : []
  } catch {
    return { error: 'Invalid line items' }
  }

  if (lines.length === 0) return { error: 'At least one line item is required' }

  const subtotalCents = lines.reduce((s, l) => s + l.unit_cost_cents * l.quantity, 0)
  const vatCents = Math.round(subtotalCents * 0.12)
  const withholdingTaxCents = Math.round(subtotalCents * 0.02)
  const totalCents = subtotalCents + vatCents - withholdingTaxCents

  const [existing] = await db
    .select({ max_po: max(purchaseOrders.po_number) })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.tenant_id, userRow.tenant_id))

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      tenant_id: userRow.tenant_id,
      project_id: projectId,
      vendor_id: vendorId ?? undefined,
      created_by: user.id,
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

  const poId = po!.id

  await db.insert(poLineItems).values(
    lines.map((l, idx) => ({
      tenant_id: userRow.tenant_id,
      po_id: poId,
      sort_order: idx,
      code: l.code || undefined,
      description: l.description,
      unit: l.unit || undefined,
      quantity: l.quantity,
      unit_cost_cents: l.unit_cost_cents,
      line_total_cents: l.unit_cost_cents * l.quantity,
    }))
  )

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
    entityType: 'purchase_order',
    entityId: poId,
    action: 'create',
    diff: { project_id: projectId, vendor_id: vendorId, subtotal_cents: subtotalCents },
  })

  revalidatePath('/purchase-orders')
  return { id: poId }
}

export async function advancePoStatus(
  poId: string,
  nextStatus: string
): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  const [po] = await db
    .select({ id: purchaseOrders.id, status: purchaseOrders.status, project_id: purchaseOrders.project_id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, userRow.tenant_id)))

  if (!po) return { error: 'PO not found' }

  const allowed = VALID_PO_TRANSITIONS[po.status] ?? []
  if (!allowed.includes(nextStatus)) {
    return { error: `Cannot transition from ${po.status} to ${nextStatus}` }
  }

  await db
    .update(purchaseOrders)
    .set({ status: nextStatus as typeof purchaseOrders.$inferSelect.status, updated_at: new Date() })
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenant_id, userRow.tenant_id)))

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
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
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

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
  if (line.tenant_id !== userRow.tenant_id) return { error: 'Line item not found' }

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
    .where(and(eq(purchaseOrders.id, line.po_id), eq(purchaseOrders.tenant_id, userRow.tenant_id)))

  if (!po) return { error: 'Purchase order not found' }
  if (po.status === 'cancelled') return { error: 'Cannot receive on a cancelled PO' }

  const now = new Date()
  const oldQty = line.received_qty

  await db
    .update(poLineItems)
    .set({
      received_qty: parsedQty,
      received_at: now,
      received_by: user.id,
    })
    .where(and(eq(poLineItems.id, lineId), eq(poLineItems.tenant_id, userRow.tenant_id)))

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
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
    .where(and(eq(poLineItems.po_id, line.po_id), eq(poLineItems.tenant_id, userRow.tenant_id)))

  const allFullyReceived =
    allLines.length > 0 && allLines.every((l) => l.received_qty >= l.quantity)

  if (allFullyReceived && po.status !== 'delivered') {
    await db
      .update(purchaseOrders)
      .set({
        status: 'delivered' as typeof purchaseOrders.$inferSelect.status,
        updated_at: now,
      })
      .where(and(eq(purchaseOrders.id, line.po_id), eq(purchaseOrders.tenant_id, userRow.tenant_id)))

    await writeAuditLog({
      tenantId: userRow.tenant_id,
      actorId: user.id,
      entityType: 'purchase_order',
      entityId: line.po_id,
      action: 'status_change',
      diff: { from: po.status, to: 'delivered', reason: 'all lines fully received' },
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
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  const [bom] = await db
    .select({ tcv_cents: boms.tcv_cents, status: boms.status })
    .from(boms)
    .where(and(eq(boms.id, bomId), eq(boms.tenant_id, userRow.tenant_id)))

  if (!bom) return { error: 'BOM not found' }
  if (bom.status === 'draft') return { error: 'BOM must be approved before billing' }

  const { invoices } = await import('@buildops/database/schema')

  const [lastInv] = await db
    .select({ max_num: max(invoices.invoice_number) })
    .from(invoices)
    .where(eq(invoices.tenant_id, userRow.tenant_id))

  const nextInvNum = nextInvoiceNumber(lastInv?.max_num ?? null)

  const subtotalCents = Math.round(bom.tcv_cents * (billingPercentBps / 10000))
  const retentionBps = 1000 // 10% standard
  const retentionCents = Math.round(subtotalCents * (retentionBps / 10000))
  const vatCents = Math.round(subtotalCents * 0.12)
  const withholdingTaxCents = Math.round(subtotalCents * 0.02)
  const netAmountCents = subtotalCents - retentionCents + vatCents - withholdingTaxCents

  const [inv] = await db
    .insert(invoices)
    .values({
      tenant_id: userRow.tenant_id,
      project_id: projectId,
      created_by: user.id,
      invoice_number: nextInvNum,
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

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
    entityType: 'invoice',
    entityId: inv!.id,
    action: 'create',
    diff: { invoice_number: nextInvNum, billing_percent_bps: billingPercentBps },
  })

  revalidatePath(`/projects/${projectId}/billing`)
  revalidatePath('/invoices')
  return { id: inv!.id }
}

// ── Invoice status advance ─────────────────────────────────────────────────────

const VALID_INVOICE_TRANSITIONS: Record<string, string[]> = {
  draft: ['issued', 'cancelled'],
  issued: ['partial_payment', 'paid', 'overdue'],
  partial_payment: ['paid', 'overdue'],
  overdue: ['paid'],
  paid: [],
  cancelled: [],
}

export async function advanceInvoiceStatus(
  invoiceId: string,
  nextStatus: string
): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  const { invoices } = await import('@buildops/database/schema')

  const [inv] = await db
    .select({ id: invoices.id, status: invoices.status, project_id: invoices.project_id })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.tenant_id, userRow.tenant_id)))

  if (!inv) return { error: 'Invoice not found' }

  const allowed = VALID_INVOICE_TRANSITIONS[inv.status] ?? []
  if (!allowed.includes(nextStatus)) {
    return { error: `Cannot transition from ${inv.status} to ${nextStatus}` }
  }

  await db
    .update(invoices)
    .set({
      status: nextStatus as typeof invoices.$inferSelect.status,
      updated_at: new Date(),
      ...(nextStatus === 'paid' ? { paid_at: new Date() } : {}),
    })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.tenant_id, userRow.tenant_id)))

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
    entityType: 'invoice',
    entityId: invoiceId,
    action: 'status_change',
    diff: { from: inv.status, to: nextStatus },
  })

  revalidatePath('/invoices')
  if (inv.project_id) revalidatePath(`/projects/${inv.project_id}/billing`)
  return {}
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

function nextInvoiceNumber(last: string | null): string {
  if (!last) return 'INV-0001'
  const match = last.match(/(\d+)$/)
  if (!match) return 'INV-0001'
  const n = parseInt(match[1]!, 10) + 1
  return `INV-${String(n).padStart(4, '0')}`
}
