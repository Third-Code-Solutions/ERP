'use server'

// REFACTOR.md M6 US-Post-001 — Punchlist write-side.
//
// The list view at /punchlist already exists (read-only). This module owns
// every mutation: create item, status workflow, PE sign-off, photo attach.
// Tenant isolation is enforced via requireUserProfile() + tenant_id match
// on every SELECT/UPDATE. RLS is the second wall.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { and, count, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import {
  requireUserProfile,
  can,
  type AbiCapability,
  type AppRole,
} from '@buildops/auth'
import { db } from '@buildops/database'
import {
  punchlistItems,
  punchlistPhotos,
  documents,
  projects,
  users as usersTable,
} from '@buildops/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { notifyUser, notifyRoles } from '@/lib/abi/notifications'
import { startSlaClock } from '@/lib/abi/sla-clock'

function guard(role: AppRole, capability: AbiCapability): string | null {
  if (!can(role, capability)) {
    return `Forbidden: role "${role}" lacks "${capability}"`
  }
  return null
}

// PE sign-off is restricted further — only SD/PM/PE can stamp it.
const PE_SIGNOFF_ROLES: AppRole[] = ['sd_pm_pe', 'pm', 'admin', 'owner']

const PRIORITY_VALUES = ['low', 'medium', 'high', 'critical'] as const
const STATUS_VALUES = ['open', 'in_progress', 'for_inspection', 'closed'] as const

const createSchema = z.object({
  project_id: z.string().uuid(),
  description: z.string().min(3, 'Description must be at least 3 characters'),
  location: z.string().max(255).optional(),
  trade: z.string().max(120).optional(),
  priority: z.enum(PRIORITY_VALUES).default('medium'),
  due_date: z.string().optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  assigned_to_text: z.string().max(255).optional(),
})

const photoSchema = z.object({
  punchlist_item_id: z.string().uuid(),
  document_id: z.string().uuid(),
  caption: z.string().max(255).optional(),
  is_before: z.enum(['true', 'false']).default('true'),
})

// Status workflow per spec: open → in_progress → for_inspection → closed.
// We allow regression for_inspection → in_progress (PE rejects). Closed is
// terminal except via reopen (out of scope for v1).
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  open: ['in_progress', 'for_inspection'],
  in_progress: ['open', 'for_inspection'],
  for_inspection: ['in_progress', 'closed'],
  closed: [], // terminal
}

export async function createPunchlistItem(
  formData: FormData
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'punchlist.manage')
  if (forbid) return { error: forbid }

  const parsed = createSchema.safeParse({
    project_id: formData.get('project_id'),
    description: formData.get('description'),
    location: formData.get('location') || undefined,
    trade: formData.get('trade') || undefined,
    priority: formData.get('priority') || 'medium',
    due_date: formData.get('due_date') || undefined,
    assigned_to_user_id: formData.get('assigned_to_user_id') || undefined,
    assigned_to_text: formData.get('assigned_to_text') || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return {
      error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}`,
    }
  }
  const input = parsed.data

  // Tenant ownership check for the project.
  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(
      and(eq(projects.id, input.project_id), eq(projects.tenant_id, profile.tenantId))
    )
    .limit(1)
  if (!project) return { error: 'Project not found' }

  // Assignee, if provided, must be in same tenant.
  if (input.assigned_to_user_id) {
    const [u] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, input.assigned_to_user_id),
          eq(usersTable.tenant_id, profile.tenantId)
        )
      )
      .limit(1)
    if (!u) return { error: 'Assignee not found' }
  }

  const dueDate = input.due_date ? new Date(input.due_date) : null
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return { error: 'due_date: invalid date' }
  }

  const [created] = await db
    .insert(punchlistItems)
    .values({
      tenant_id: profile.tenantId,
      project_id: input.project_id,
      description: input.description,
      location: input.location,
      trade: input.trade,
      priority: input.priority,
      status: 'open',
      due_date: dueDate,
      assigned_to_user_id: input.assigned_to_user_id,
      assigned_to_text: input.assigned_to_text,
      created_by: profile.user.id,
    })
    .returning({ id: punchlistItems.id })

  const itemId = created!.id

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'punchlist_item',
    entityId: itemId,
    action: 'create',
    diff: {
      description: input.description,
      priority: input.priority,
      project_id: input.project_id,
      assigned_to_user_id: input.assigned_to_user_id ?? null,
    },
  })

  // Start SLA clock so the cron can fire warn/breach notifications.
  await startSlaClock({
    tenantId: profile.tenantId,
    entityType: 'punchlist_item',
    entityId: itemId,
    label: 'punchlist.due_date',
  })

  // Auto-notify the assignee right now. The 3-day pre-due nudge is the
  // SLA checker's job.
  if (input.assigned_to_user_id) {
    await notifyUser({
      tenantId: profile.tenantId,
      recipientUserId: input.assigned_to_user_id,
      subject: `Punchlist assigned: ${input.description.slice(0, 60)}`,
      body: `Project: ${project.name}${input.location ? ` — ${input.location}` : ''}`,
      linkUrl: `/punchlist/${itemId}`,
    })
  }

  revalidatePath('/punchlist')
  revalidatePath(`/projects/${input.project_id}`)
  redirect(`/punchlist/${itemId}`)
}

export async function updatePunchlistStatus(
  itemId: string,
  newStatus: (typeof STATUS_VALUES)[number]
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'punchlist.manage')
  if (forbid) return { error: forbid }

  if (!STATUS_VALUES.includes(newStatus)) {
    return { error: `Unknown status "${newStatus}"` }
  }

  const [item] = await db
    .select()
    .from(punchlistItems)
    .where(
      and(eq(punchlistItems.id, itemId), eq(punchlistItems.tenant_id, profile.tenantId))
    )
    .limit(1)
  if (!item) return { error: 'Punchlist item not found' }

  if (item.status === newStatus) return {}

  const allowed = ALLOWED_TRANSITIONS[item.status] ?? []
  if (!allowed.includes(newStatus)) {
    return { error: `Cannot transition ${item.status} → ${newStatus}` }
  }

  // Closing requires PE sign-off. The dedicated signOff action is the only
  // path that should produce status='closed'; the explicit guard here
  // protects against direct UI calls.
  if (newStatus === 'closed' && !item.pe_signed_off_at) {
    return { error: 'requires_pe_signoff' }
  }

  const patch: Partial<typeof punchlistItems.$inferInsert> = {
    status: newStatus,
  }
  if (newStatus === 'closed') {
    patch.closed_at = new Date()
  }

  await db.update(punchlistItems).set(patch).where(eq(punchlistItems.id, itemId))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'punchlist_item',
    entityId: itemId,
    action: 'status_change',
    diff: { status: { before: item.status, after: newStatus } },
  })

  if (newStatus === 'closed') {
    await checkProjectCompletion(profile.tenantId, item.project_id)
  }

  revalidatePath('/punchlist')
  revalidatePath(`/punchlist/${itemId}`)
  revalidatePath(`/projects/${item.project_id}`)
  return {}
}

export async function signOffPunchlistItem(
  itemId: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'punchlist.manage')
  if (forbid) return { error: forbid }
  if (!PE_SIGNOFF_ROLES.includes(profile.role)) {
    return {
      error: `Forbidden: PE sign-off requires role in ${PE_SIGNOFF_ROLES.join(', ')}`,
    }
  }

  const [item] = await db
    .select()
    .from(punchlistItems)
    .where(
      and(eq(punchlistItems.id, itemId), eq(punchlistItems.tenant_id, profile.tenantId))
    )
    .limit(1)
  if (!item) return { error: 'Punchlist item not found' }

  if (item.pe_signed_off_at) return { error: 'Already signed off' }

  const now = new Date()
  const patch: Partial<typeof punchlistItems.$inferInsert> = {
    pe_signed_off_at: now,
    pe_signed_off_by: profile.user.id,
  }

  // If it was ready for inspection, flip to closed in the same write so
  // we don't have a "stuck in for_inspection but signed" race.
  const willClose = item.status === 'for_inspection'
  if (willClose) {
    patch.status = 'closed'
    patch.closed_at = now
  }

  await db.update(punchlistItems).set(patch).where(eq(punchlistItems.id, itemId))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'punchlist_item',
    entityId: itemId,
    action: 'approve',
    diff: {
      pe_signed_off_at: now.toISOString(),
      status: willClose ? { before: item.status, after: 'closed' } : item.status,
    },
  })

  if (willClose) {
    await checkProjectCompletion(profile.tenantId, item.project_id)
  }

  revalidatePath('/punchlist')
  revalidatePath(`/punchlist/${itemId}`)
  revalidatePath(`/projects/${item.project_id}`)
  return {}
}

export async function addPunchlistPhoto(
  formData: FormData
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'punchlist.manage')
  if (forbid) return { error: forbid }

  const parsed = photoSchema.safeParse({
    punchlist_item_id: formData.get('punchlist_item_id'),
    document_id: formData.get('document_id'),
    caption: formData.get('caption') || undefined,
    is_before: formData.get('is_before') || 'true',
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return {
      error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}`,
    }
  }
  const input = parsed.data

  // Verify both punchlist item and document live in this tenant.
  const [item] = await db
    .select({ id: punchlistItems.id })
    .from(punchlistItems)
    .where(
      and(
        eq(punchlistItems.id, input.punchlist_item_id),
        eq(punchlistItems.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!item) return { error: 'Punchlist item not found' }

  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(eq(documents.id, input.document_id), eq(documents.tenant_id, profile.tenantId))
    )
    .limit(1)
  if (!doc) return { error: 'Document not found' }

  // Cap at 5 photos per item (spec).
  const countRows = await db
    .select({ value: count() })
    .from(punchlistPhotos)
    .where(
      and(
        eq(punchlistPhotos.tenant_id, profile.tenantId),
        eq(punchlistPhotos.punchlist_item_id, input.punchlist_item_id)
      )
    )
  const existingCount = countRows[0]?.value ?? 0
  if (existingCount >= 5) {
    return { error: 'Maximum 5 photos per punchlist item' }
  }

  const [created] = await db
    .insert(punchlistPhotos)
    .values({
      tenant_id: profile.tenantId,
      punchlist_item_id: input.punchlist_item_id,
      document_id: input.document_id,
      caption: input.caption,
      is_before: input.is_before === 'true',
    })
    .returning({ id: punchlistPhotos.id })

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'punchlist_photo',
    entityId: created!.id,
    action: 'create',
    diff: {
      punchlist_item_id: input.punchlist_item_id,
      document_id: input.document_id,
      is_before: input.is_before === 'true',
    },
  })

  revalidatePath(`/punchlist/${input.punchlist_item_id}`)
  return {}
}

// When an item closes, see if the project's punchlist is fully resolved.
// "Done" means zero items not in 'closed' status. Notify CX so they can
// kick off the warranty / onboarding cycle.
async function checkProjectCompletion(
  tenantId: string,
  projectId: string
): Promise<void> {
  const openRows = await db
    .select({ value: count() })
    .from(punchlistItems)
    .where(
      and(
        eq(punchlistItems.tenant_id, tenantId),
        eq(punchlistItems.project_id, projectId),
        ne(punchlistItems.status, 'closed')
      )
    )
  const openCount = openRows[0]?.value ?? 0

  if (openCount === 0) {
    const [project] = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId)))
      .limit(1)
    if (!project) return

    await notifyRoles({
      tenantId,
      recipientRoles: ['cx'],
      subject: `Punchlist 100% closed — ${project.name}`,
      body: 'All punchlist items resolved. Project is eligible for turnover / COC.',
      linkUrl: `/projects/${projectId}/turnover`,
    })
  }
}
