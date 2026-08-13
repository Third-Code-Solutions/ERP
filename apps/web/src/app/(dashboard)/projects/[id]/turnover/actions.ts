'use server'

// REFACTOR.md M6 US-Post-002 — Turnover package compilation.
//
// Four document slots must be attached before a turnover can be marked
// compiled: as-built drawings, O&M manuals, warranty certs, keys log. The
// row is created lazily on first attach so the project record stays clean
// for projects that never reach this stage.

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  requireUserProfile,
  can,
  type ErpCapability,
  type AppRole,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  documents,
  projects,
  turnoverPackages,
} from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'

function guard(role: AppRole, capability: ErpCapability): string | null {
  if (!can(role, capability)) {
    return `Forbidden: role "${role}" lacks "${capability}"`
  }
  return null
}

const TURNOVER_SLOTS = ['as_built', 'om_manual', 'warranty_cert', 'keys_log'] as const
export type TurnoverSlot = (typeof TURNOVER_SLOTS)[number]

const SLOT_COLUMN: Record<TurnoverSlot, keyof typeof turnoverPackages.$inferInsert> = {
  as_built: 'as_built_document_id',
  om_manual: 'om_manual_document_id',
  warranty_cert: 'warranty_cert_document_id',
  keys_log: 'keys_log_document_id',
}

const attachSchema = z.object({
  project_id: z.string().uuid(),
  slot: z.enum(TURNOVER_SLOTS),
  document_id: z.string().uuid(),
})

export async function attachTurnoverDocument(
  projectId: string,
  slot: TurnoverSlot,
  documentId: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'punchlist.manage')
  if (forbid) return { error: forbid }

  const parsed = attachSchema.safeParse({
    project_id: projectId,
    slot,
    document_id: documentId,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return {
      error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}`,
    }
  }

  // Tenant ownership on both project + document.
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)
  if (!project) return { error: 'Project not found' }

  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.tenant_id, profile.tenantId)))
    .limit(1)
  if (!doc) return { error: 'Document not found' }

  const column = SLOT_COLUMN[slot]

  // Upsert: get-or-create the row, then patch the slot.
  const [existing] = await db
    .select()
    .from(turnoverPackages)
    .where(
      and(
        eq(turnoverPackages.project_id, projectId),
        eq(turnoverPackages.tenant_id, profile.tenantId)
      )
    )
    .limit(1)

  if (!existing) {
    const insertRow: typeof turnoverPackages.$inferInsert = {
      tenant_id: profile.tenantId,
      project_id: projectId,
    }
    ;(insertRow as Record<string, unknown>)[column] = documentId
    const [created] = await db
      .insert(turnoverPackages)
      .values(insertRow)
      .returning({ id: turnoverPackages.id })
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'turnover_package',
      entityId: created!.id,
      action: 'create',
      diff: { project_id: projectId, [slot]: documentId },
    })
  } else {
    if (existing.compiled_at) {
      return { error: 'Turnover already compiled — cannot replace documents' }
    }
    await db
      .update(turnoverPackages)
      .set({ [column]: documentId } as Record<string, unknown>)
      .where(
        and(
          eq(turnoverPackages.id, existing.id),
          eq(turnoverPackages.tenant_id, profile.tenantId)
        )
      )
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'turnover_package',
      entityId: existing.id,
      action: 'update',
      diff: { [slot]: { before: (existing as Record<string, unknown>)[column] ?? null, after: documentId } },
    })
  }

  revalidatePath(`/projects/${projectId}/turnover`)
  revalidatePath(`/projects/${projectId}/coc`)
  return {}
}

export async function markTurnoverCompiled(
  projectId: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'punchlist.manage')
  if (forbid) return { error: forbid }

  if (!z.string().uuid().safeParse(projectId).success) {
    return { error: 'Invalid project id' }
  }

  const [existing] = await db
    .select()
    .from(turnoverPackages)
    .where(
      and(
        eq(turnoverPackages.project_id, projectId),
        eq(turnoverPackages.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!existing) return { error: 'Turnover package not created yet' }
  if (existing.compiled_at) return { error: 'Already compiled' }

  // Enforce: all 4 slots filled.
  const allAttached =
    existing.as_built_document_id &&
    existing.om_manual_document_id &&
    existing.warranty_cert_document_id &&
    existing.keys_log_document_id
  if (!allAttached) {
    return { error: 'All four documents must be attached before compiling' }
  }

  const now = new Date()
  await db
    .update(turnoverPackages)
    .set({ compiled_at: now })
    .where(
      and(
        eq(turnoverPackages.id, existing.id),
        eq(turnoverPackages.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'turnover_package',
    entityId: existing.id,
    action: 'approve',
    diff: { compiled_at: now.toISOString() },
  })

  revalidatePath(`/projects/${projectId}/turnover`)
  revalidatePath(`/projects/${projectId}/coc`)
  return {}
}
