'use server'

// Delivery / Inspection / Acceptance workflow — write-side.
//
// Status machine:
//   scheduled → site_preparing → site_ready → in_transit → received
//             → inspecting → accepted | rejected
//   any non-terminal → cancelled
//
// Tenant isolation is enforced via requireUserProfile() + tenant_id match
// on every read/write. RLS is the backstop. Each transition is audited and
// the relevant ops roles are notified.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  requireUserProfile,
  can,
  type ErpCapability,
  type AppRole,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  deliverySchedules,
  deliveryInspections,
  purchaseOrders,
} from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { notifyRoles } from '@/lib/operations/notifications'
import {
  completeDeliveryInspectionThroughCoreApi,
  cancelDeliveryThroughCoreApi,
  deliveryCancelWritesUseCoreApi,
  deliveryMarkInTransitWritesUseCoreApi,
  deliveryInspectionCompleteWritesUseCoreApi,
  deliveryInspectionStartWritesUseCoreApi,
  deliverySitePreparationCompleteWritesUseCoreApi,
  deliverySitePreparationStartWritesUseCoreApi,
  completeDeliverySitePreparationThroughCoreApi,
  startDeliveryInspectionThroughCoreApi,
  startDeliverySitePreparationThroughCoreApi,
  deliveryReceiptWritesUseCoreApi,
  recordDeliveryReceiptThroughCoreApi,
  markDeliveryInTransitThroughCoreApi,
  createDeliveryScheduleThroughCoreApi,
  deliveryScheduleCreateWritesUseCoreApi,
} from '@/lib/erp-core-client'

type DeliveryStatus =
  | 'scheduled'
  | 'site_preparing'
  | 'site_ready'
  | 'in_transit'
  | 'received'
  | 'inspecting'
  | 'accepted'
  | 'rejected'
  | 'cancelled'

type InspectionResult = 'pending' | 'pass' | 'fail' | 'partial_pass'

const TERMINAL: ReadonlySet<DeliveryStatus> = new Set([
  'accepted',
  'rejected',
  'cancelled',
])

function guard(role: AppRole, capability: ErpCapability): string | null {
  if (!can(role, capability)) {
    return `Forbidden: role "${role}" lacks "${capability}"`
  }
  return null
}

// Either po.issue OR precon.manage_checklist grants the right to schedule
// a delivery, per spec. We check both and pass if either does.
function guardScheduling(role: AppRole): string | null {
  if (can(role, 'po.issue') || can(role, 'precon.manage_checklist')) {
    return null
  }
  return `Forbidden: role "${role}" lacks delivery scheduling capability`
}

function assertTransition(
  current: DeliveryStatus,
  next: DeliveryStatus,
  allowed: readonly DeliveryStatus[]
): string | null {
  if (!allowed.includes(current)) {
    return `Cannot transition ${current} → ${next}`
  }
  return null
}

async function loadSchedule(scheduleId: string, tenantId: string) {
  const [row] = await db
    .select()
    .from(deliverySchedules)
    .where(
      and(
        eq(deliverySchedules.id, scheduleId),
        eq(deliverySchedules.tenant_id, tenantId)
      )
    )
    .limit(1)
  return row ?? null
}

function revalidate(scheduleId: string): void {
  revalidatePath('/procurement/deliveries')
  revalidatePath(`/procurement/deliveries/${scheduleId}`)
}

const scheduleSchema = z.object({
  purchase_order_id: z.string().uuid(),
  scheduled_date: z.string().min(1, 'Scheduled date required'),
  site_address: z.string().min(3, 'Site address required'),
  site_contact_name: z.string().min(1, 'Site contact name required'),
  site_contact_phone: z.string().min(1, 'Site contact phone required'),
  site_preparation_notes: z.string().optional(),
})

export async function scheduleDelivery(
  formData: FormData
): Promise<{ error?: string; id?: string }> {
  const profile = await requireUserProfile()
  const forbid = guardScheduling(profile.role)
  if (forbid) return { error: forbid }

  const parsed = scheduleSchema.safeParse({
    purchase_order_id: formData.get('purchase_order_id'),
    scheduled_date: formData.get('scheduled_date'),
    site_address: formData.get('site_address'),
    site_contact_name: formData.get('site_contact_name'),
    site_contact_phone: formData.get('site_contact_phone'),
    site_preparation_notes: formData.get('site_preparation_notes') || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return {
      error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}`,
    }
  }
  const input = parsed.data

  const scheduledDate = new Date(input.scheduled_date)
  if (Number.isNaN(scheduledDate.getTime())) {
    return { error: 'scheduled_date: invalid date' }
  }

  if (deliveryScheduleCreateWritesUseCoreApi(profile.tenantId)) {
    const key = z
      .string()
      .trim()
      .min(1)
      .max(256)
      .safeParse(formData.get('idempotency_key'))
    if (!key.success) {
      return {
        error: 'Retry token is required for the delivery schedule command.',
      }
    }
    const result = await createDeliveryScheduleThroughCoreApi(
      {
        purchaseOrderId: input.purchase_order_id,
        scheduledDate: scheduledDate.toISOString(),
        siteAddress: input.site_address,
        siteContactName: input.site_contact_name,
        siteContactPhone: input.site_contact_phone,
        sitePreparationNotes: input.site_preparation_notes ?? null,
      },
      key.data
    )
    if (!result.ok || !result.data) {
      return {
        error:
          result.error ??
          'Delivery schedule could not be created through ERP Core.',
      }
    }
    revalidate(result.data.id)
    redirect(`/procurement/deliveries/${result.data.id}`)
  }

  // Tenant ownership: PO must live in this tenant.
  const [po] = await db
    .select({ id: purchaseOrders.id, po_number: purchaseOrders.po_number })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.id, input.purchase_order_id),
        eq(purchaseOrders.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!po) return { error: 'Purchase order not found' }

  const [created] = await db
    .insert(deliverySchedules)
    .values({
      tenant_id: profile.tenantId,
      purchase_order_id: input.purchase_order_id,
      status: 'scheduled',
      scheduled_date: scheduledDate,
      site_address: input.site_address,
      site_contact_name: input.site_contact_name,
      site_contact_phone: input.site_contact_phone,
      site_preparation_notes: input.site_preparation_notes,
      created_by: profile.user.id,
    })
    .returning({ id: deliverySchedules.id })

  const scheduleId = created!.id

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'delivery_schedule',
    entityId: scheduleId,
    action: 'create',
    diff: {
      purchase_order_id: input.purchase_order_id,
      scheduled_date: scheduledDate.toISOString(),
      site_address: input.site_address,
      status: 'scheduled',
    },
  })

  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['sd_pm_pe', 'procurement'],
    subject: `Delivery scheduled for PO ${po.po_number}`,
    body: `Scheduled ${scheduledDate.toLocaleDateString('en-PH')} · ${input.site_address}`,
    linkUrl: `/procurement/deliveries/${scheduleId}`,
  })

  revalidatePath('/procurement/deliveries')
  redirect(`/procurement/deliveries/${scheduleId}`)
}

export async function markSitePreparing(
  scheduleId: string,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guardScheduling(profile.role)
  if (forbid) return { error: forbid }

  const row = await loadSchedule(scheduleId, profile.tenantId)
  if (!row) return { error: 'Delivery not found' }

  if (deliverySitePreparationStartWritesUseCoreApi(profile.tenantId)) {
    const key = z.string().trim().min(1).max(256).safeParse(idempotencyKey)
    if (!key.success) {
      return {
        error:
          'Retry token is required for the delivery site-preparation command.',
      }
    }
    const result = await startDeliverySitePreparationThroughCoreApi(
      scheduleId,
      {},
      key.data
    )
    if (!result.ok || !result.data) {
      return {
        error:
          result.error ??
          'Delivery site preparation could not be started through ERP Core.',
      }
    }
    revalidate(scheduleId)
    return {}
  }

  const violation = assertTransition(row.status as DeliveryStatus, 'site_preparing', [
    'scheduled',
  ])
  if (violation) return { error: violation }

  await db
    .update(deliverySchedules)
    .set({ status: 'site_preparing', updated_at: new Date() })
    .where(
      and(
        eq(deliverySchedules.id, scheduleId),
        eq(deliverySchedules.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'delivery_schedule',
    entityId: scheduleId,
    action: 'status_change',
    diff: { status: { before: row.status, after: 'site_preparing' } },
  })

  revalidate(scheduleId)
  return {}
}

export async function markSiteReady(
  scheduleId: string,
  notes?: string,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guardScheduling(profile.role)
  if (forbid) return { error: forbid }

  const row = await loadSchedule(scheduleId, profile.tenantId)
  if (!row) return { error: 'Delivery not found' }

  if (deliverySitePreparationCompleteWritesUseCoreApi(profile.tenantId)) {
    const key = z.string().trim().min(1).max(256).safeParse(idempotencyKey)
    if (!key.success) {
      return {
        error:
          'Retry token is required for the delivery site-preparation completion command.',
      }
    }
    const result = await completeDeliverySitePreparationThroughCoreApi(
      scheduleId,
      { notes: notes?.trim() || row.site_preparation_notes || null },
      key.data
    )
    if (!result.ok || !result.data) {
      return {
        error:
          result.error ??
          'Delivery site preparation could not be completed through ERP Core.',
      }
    }
    revalidate(scheduleId)
    return {}
  }

  const violation = assertTransition(row.status as DeliveryStatus, 'site_ready', [
    'site_preparing',
  ])
  if (violation) return { error: violation }

  const now = new Date()
  await db
    .update(deliverySchedules)
    .set({
      status: 'site_ready',
      site_prepared_at: now,
      site_prepared_by: profile.user.id,
      site_preparation_notes: notes ?? row.site_preparation_notes,
      updated_at: now,
    })
    .where(
      and(
        eq(deliverySchedules.id, scheduleId),
        eq(deliverySchedules.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'delivery_schedule',
    entityId: scheduleId,
    action: 'status_change',
    diff: {
      status: { before: row.status, after: 'site_ready' },
      site_prepared_at: now.toISOString(),
      notes: notes ?? null,
    },
  })

  revalidate(scheduleId)
  return {}
}

export async function markInTransit(
  scheduleId: string,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guardScheduling(profile.role)
  if (forbid) return { error: forbid }

  const row = await loadSchedule(scheduleId, profile.tenantId)
  if (!row) return { error: 'Delivery not found' }

  if (deliveryMarkInTransitWritesUseCoreApi(profile.tenantId)) {
    const key = z.string().trim().min(1).max(256).safeParse(idempotencyKey)
    if (!key.success) {
      return {
        error: 'Retry token is required for the delivery in-transit command.',
      }
    }
    const result = await markDeliveryInTransitThroughCoreApi(
      scheduleId,
      {},
      key.data
    )
    if (!result.ok || !result.data) {
      return {
        error:
          result.error ??
          'Delivery could not be marked in transit through ERP Core.',
      }
    }
    revalidate(scheduleId)
    return {}
  }

  const violation = assertTransition(row.status as DeliveryStatus, 'in_transit', [
    'site_ready',
  ])
  if (violation) return { error: violation }

  await db
    .update(deliverySchedules)
    .set({ status: 'in_transit', updated_at: new Date() })
    .where(
      and(
        eq(deliverySchedules.id, scheduleId),
        eq(deliverySchedules.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'delivery_schedule',
    entityId: scheduleId,
    action: 'status_change',
    diff: { status: { before: row.status, after: 'in_transit' } },
  })

  // Get PO number for notification copy.
  const [po] = await db
    .select({ po_number: purchaseOrders.po_number })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.id, row.purchase_order_id),
        eq(purchaseOrders.tenant_id, profile.tenantId)
      )
    )
    .limit(1)

  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['sd_pm_pe'],
    subject: `Delivery in transit${po ? ` — PO ${po.po_number}` : ''}`,
    body: 'Shipment is en route. Verify site readiness before receipt.',
    linkUrl: `/procurement/deliveries/${scheduleId}`,
  })

  revalidate(scheduleId)
  return {}
}

export async function recordReceipt(
  scheduleId: string,
  notes?: string,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guardScheduling(profile.role)
  if (forbid) return { error: forbid }

  const row = await loadSchedule(scheduleId, profile.tenantId)
  if (!row) return { error: 'Delivery not found' }

  if (deliveryReceiptWritesUseCoreApi(profile.tenantId)) {
    const key = z.string().trim().min(1).max(256).safeParse(idempotencyKey)
    if (!key.success) {
      return {
        error: 'Retry token is required for the delivery receipt command.',
      }
    }
    const result = await recordDeliveryReceiptThroughCoreApi(
      scheduleId,
      { notes: notes?.trim() || null },
      key.data
    )
    if (!result.ok || !result.data) {
      return {
        error:
          result.error ??
          'Delivery receipt could not be committed through ERP Core.',
      }
    }
    revalidate(scheduleId)
    return {}
  }

  // Spec allows receipt from in_transit OR scheduled (some deliveries skip
  // the prep workflow because the site is already prepared earlier).
  const violation = assertTransition(row.status as DeliveryStatus, 'received', [
    'in_transit',
    'scheduled',
  ])
  if (violation) return { error: violation }

  const now = new Date()
  await db
    .update(deliverySchedules)
    .set({
      status: 'received',
      received_at: now,
      received_by: profile.user.id,
      received_notes: notes ?? null,
      updated_at: now,
    })
    .where(
      and(
        eq(deliverySchedules.id, scheduleId),
        eq(deliverySchedules.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'delivery_schedule',
    entityId: scheduleId,
    action: 'status_change',
    diff: {
      status: { before: row.status, after: 'received' },
      received_at: now.toISOString(),
      notes: notes ?? null,
    },
  })

  revalidate(scheduleId)
  return {}
}

export async function startInspection(
  scheduleId: string,
  idempotencyKey?: string
): Promise<{ error?: string; inspectionId?: string }> {
  const profile = await requireUserProfile()
  const forbid = guardScheduling(profile.role)
  if (forbid) return { error: forbid }

  const row = await loadSchedule(scheduleId, profile.tenantId)
  if (!row) return { error: 'Delivery not found' }

  if (deliveryInspectionStartWritesUseCoreApi(profile.tenantId)) {
    const key = z.string().trim().min(1).max(256).safeParse(idempotencyKey)
    if (!key.success) {
      return {
        error: 'Retry token is required for the delivery inspection command.',
      }
    }
    const result = await startDeliveryInspectionThroughCoreApi(
      scheduleId,
      {},
      key.data
    )
    if (!result.ok || !result.data) {
      return {
        error:
          result.error ??
          'Delivery inspection could not be started through ERP Core.',
      }
    }
    revalidate(scheduleId)
    return { inspectionId: result.data.inspectionId }
  }

  const violation = assertTransition(row.status as DeliveryStatus, 'inspecting', [
    'received',
  ])
  if (violation) return { error: violation }

  const now = new Date()
  const [inspection] = await db
    .insert(deliveryInspections)
    .values({
      tenant_id: profile.tenantId,
      delivery_schedule_id: scheduleId,
      inspector_id: profile.user.id,
      started_at: now,
      result: 'pending',
    })
    .returning({ id: deliveryInspections.id })

  await db
    .update(deliverySchedules)
    .set({ status: 'inspecting', updated_at: now })
    .where(
      and(
        eq(deliverySchedules.id, scheduleId),
        eq(deliverySchedules.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'delivery_schedule',
    entityId: scheduleId,
    action: 'status_change',
    diff: {
      status: { before: row.status, after: 'inspecting' },
      inspection_id: inspection!.id,
    },
  })

  revalidate(scheduleId)
  return { inspectionId: inspection!.id }
}

const completeInspectionResults = ['pass', 'fail', 'partial_pass'] as const

export async function completeInspection(
  scheduleId: string,
  result: (typeof completeInspectionResults)[number],
  defectNotes?: string,
  acceptanceNotes?: string,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guardScheduling(profile.role)
  if (forbid) return { error: forbid }

  if (!completeInspectionResults.includes(result)) {
    return { error: `Unknown inspection result "${result}"` }
  }

  const row = await loadSchedule(scheduleId, profile.tenantId)
  if (!row) return { error: 'Delivery not found' }

  if (deliveryInspectionCompleteWritesUseCoreApi(profile.tenantId)) {
    const key = z.string().trim().min(1).max(256).safeParse(idempotencyKey)
    if (!key.success) {
      return {
        error:
          'Retry token is required for the delivery inspection completion command.',
      }
    }
    const coreResult = await completeDeliveryInspectionThroughCoreApi(
      scheduleId,
      {
        result,
        defectNotes: defectNotes?.trim() || null,
        acceptanceNotes: acceptanceNotes?.trim() || null,
      },
      key.data
    )
    if (!coreResult.ok || !coreResult.data) {
      return {
        error:
          coreResult.error ??
          'Delivery inspection could not be completed through ERP Core.',
      }
    }
    revalidate(scheduleId)
    return {}
  }

  if (row.status !== 'inspecting') {
    return {
      error: `Cannot complete inspection — delivery is in status "${row.status}"`,
    }
  }

  // Grab the latest inspection row started for this delivery.
  const [latest] = await db
    .select({ id: deliveryInspections.id })
    .from(deliveryInspections)
    .where(
      and(
        eq(deliveryInspections.delivery_schedule_id, scheduleId),
        eq(deliveryInspections.tenant_id, profile.tenantId)
      )
    )
    .orderBy(desc(deliveryInspections.started_at))
    .limit(1)
  if (!latest) {
    return { error: 'No active inspection found for this delivery' }
  }

  const now = new Date()
  const isAccept = result === 'pass' || result === 'partial_pass'
  const isReject = result === 'fail'
  const nextStatus: DeliveryStatus = isAccept ? 'accepted' : 'rejected'

  await db
    .update(deliveryInspections)
    .set({
      completed_at: now,
      result: result as InspectionResult,
      defect_notes: defectNotes ?? null,
      acceptance_notes: acceptanceNotes ?? null,
    })
    .where(
      and(
        eq(deliveryInspections.id, latest.id),
        eq(deliveryInspections.tenant_id, profile.tenantId)
      )
    )

  // Update parent delivery row with the right terminal stamps.
  const schedulePatch: Partial<typeof deliverySchedules.$inferInsert> = {
    status: nextStatus,
    updated_at: now,
  }
  if (isAccept) {
    schedulePatch.accepted_at = now
    schedulePatch.accepted_by = profile.user.id
  } else if (isReject) {
    schedulePatch.rejected_at = now
    schedulePatch.rejected_reason = defectNotes ?? 'Inspection failed'
  }

  await db
    .update(deliverySchedules)
    .set(schedulePatch)
    .where(
      and(
        eq(deliverySchedules.id, scheduleId),
        eq(deliverySchedules.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'delivery_schedule',
    entityId: scheduleId,
    action: isAccept ? 'approve' : 'status_change',
    diff: {
      status: { before: row.status, after: nextStatus },
      inspection_result: result,
      defect_notes: defectNotes ?? null,
      acceptance_notes: acceptanceNotes ?? null,
    },
  })

  const [po] = await db
    .select({ po_number: purchaseOrders.po_number })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.id, row.purchase_order_id),
        eq(purchaseOrders.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  const poLabel = po ? ` — PO ${po.po_number}` : ''

  if (isAccept) {
    await notifyRoles({
      tenantId: profile.tenantId,
      recipientRoles: ['procurement', 'commercial'],
      subject: `Delivery accepted${poLabel}`,
      body:
        result === 'partial_pass'
          ? 'Delivery accepted with noted defects. Review acceptance notes.'
          : 'Delivery passed inspection.',
      linkUrl: `/procurement/deliveries/${scheduleId}`,
    })
  } else {
    await notifyRoles({
      tenantId: profile.tenantId,
      recipientRoles: ['procurement', 'commercial', 'sd_pm_pe'],
      subject: `Delivery REJECTED${poLabel}`,
      body: defectNotes ?? 'Inspection failed.',
      linkUrl: `/procurement/deliveries/${scheduleId}`,
    })
  }

  revalidate(scheduleId)
  return {}
}

export async function cancelDelivery(
  scheduleId: string,
  reason: string,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guardScheduling(profile.role)
  if (forbid) return { error: forbid }

  const trimmed = reason?.trim() ?? ''
  if (trimmed.length < 1) {
    return { error: 'Cancellation reason is required' }
  }

  const row = await loadSchedule(scheduleId, profile.tenantId)
  if (!row) return { error: 'Delivery not found' }

  if (deliveryCancelWritesUseCoreApi(profile.tenantId)) {
    const key = z.string().trim().min(1).max(256).safeParse(idempotencyKey)
    if (!key.success) {
      return {
        error: 'Retry token is required for the delivery cancellation command.',
      }
    }
    const result = await cancelDeliveryThroughCoreApi(
      scheduleId,
      { reason: trimmed },
      key.data
    )
    if (!result.ok || !result.data) {
      return {
        error:
          result.error ??
          'Delivery could not be cancelled through ERP Core.',
      }
    }
    revalidate(scheduleId)
    return {}
  }

  if (TERMINAL.has(row.status as DeliveryStatus)) {
    return { error: `Cannot cancel — delivery is already ${row.status}` }
  }

  const now = new Date()
  await db
    .update(deliverySchedules)
    .set({
      status: 'cancelled',
      rejected_reason: trimmed,
      updated_at: now,
    })
    .where(
      and(
        eq(deliverySchedules.id, scheduleId),
        eq(deliverySchedules.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'delivery_schedule',
    entityId: scheduleId,
    action: 'status_change',
    diff: {
      status: { before: row.status, after: 'cancelled' },
      reason: trimmed,
    },
  })

  revalidate(scheduleId)
  return {}
}
