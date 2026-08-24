'use server'

/**
 * M5 US-Con-002 — Variation Orders.
 *
 * Lifecycle:
 *   draft → pending_commercial_pricing → pending_client_signature → signed
 *                                                                ↘ rejected (any stage)
 *
 * `createDocuSealSubmission` is invoked when a VO is sent for client
 * signature. The DocuSeal webhook lives in Track 4's handler — we
 * coordinate by stamping `entity_type='vo'` into the submission metadata
 * so the webhook can find the right row via docuseal_submission_id.
 */

import { revalidatePath } from 'next/cache'
import { and, asc, count, eq } from 'drizzle-orm'
import { can, getUserProfile, type AppRole } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  projects,
  variationOrders,
} from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { resolvePrimaryClientSignatory } from '@/lib/operations/client-signatory'
import { notifyRoles } from '@/lib/operations/notifications'
import { createSigningSession } from '@/lib/operations/integrations/docuseal'

export type VoChangeType = 'client_initiated' | 'site_condition' | 'design_error'
export type VoStatus =
  | 'draft'
  | 'pending_commercial_pricing'
  | 'pending_client_signature'
  | 'signed'
  | 'rejected'

interface TenantCtx {
  tenantId: string
  userId: string
  role: AppRole
}

async function getTenantContext(): Promise<TenantCtx | { error: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  return { tenantId: profile.tenantId, userId: profile.user.id, role: profile.role }
}

async function loadVo(voId: string, tenantId: string) {
  const [vo] = await db
    .select()
    .from(variationOrders)
    .where(and(eq(variationOrders.id, voId), eq(variationOrders.tenant_id, tenantId)))
    .limit(1)
  return vo ?? null
}

async function nextVoNumber(projectId: string, tenantId: string): Promise<string> {
  const [row] = await db
    .select({ n: count() })
    .from(variationOrders)
    .where(
      and(
        eq(variationOrders.project_id, projectId),
        eq(variationOrders.tenant_id, tenantId),
      ),
    )
  const seq = (row?.n ?? 0) + 1
  return `VO-${String(seq).padStart(4, '0')}`
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : ''
}

function isChangeType(v: string): v is VoChangeType {
  return v === 'client_initiated' || v === 'site_condition' || v === 'design_error'
}

export async function createVo(
  projectId: string,
  formData: FormData,
): Promise<{ error?: string; id?: string }> {
  const ctx = await getTenantContext()
  if ('error' in ctx) return { error: ctx.error }
  if (!can(ctx.role, 'variation_order.create')) {
    return { error: 'Forbidden: your role cannot create variation orders.' }
  }

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, ctx.tenantId)))
    .limit(1)
  if (!project) return { error: 'Project not found' }

  const description = str(formData.get('description'))
  if (!description) return { error: 'Description is required' }

  const changeTypeRaw = str(formData.get('change_type'))
  if (!isChangeType(changeTypeRaw)) return { error: 'Invalid change type' }

  const costPhpRaw = str(formData.get('cost_impact_php'))
  const costPhp = Number(costPhpRaw)
  if (!Number.isFinite(costPhp)) return { error: 'Cost impact must be a number' }
  const cost_impact_cents = Math.round(costPhp * 100)

  const timeRaw = str(formData.get('time_impact_days'))
  const timeDays = Number(timeRaw)
  if (!Number.isFinite(timeDays)) return { error: 'Time impact must be a number' }

  const voNumber = await nextVoNumber(projectId, ctx.tenantId)

  const [inserted] = await db
    .insert(variationOrders)
    .values({
      tenant_id: ctx.tenantId,
      project_id: projectId,
      vo_number: voNumber,
      description,
      change_type: changeTypeRaw,
      cost_impact_cents,
      time_impact_days: Math.trunc(timeDays),
      status: 'draft',
      created_by: ctx.userId,
    })
    .returning({ id: variationOrders.id })

  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    entityType: 'variation_order',
    entityId: inserted!.id,
    action: 'create',
    diff: {
      vo_number: voNumber,
      change_type: changeTypeRaw,
      cost_impact_cents,
      time_impact_days: Math.trunc(timeDays),
      status: 'draft',
    },
  })

  revalidatePath(`/projects/${projectId}/vos`)
  return { id: inserted!.id }
}

export async function submitVoForCommercialPricing(
  voId: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  if ('error' in ctx) return { error: ctx.error }
  if (!can(ctx.role, 'variation_order.submit_for_commercial_pricing')) {
    return { error: 'Forbidden: your role cannot submit variation orders for commercial pricing.' }
  }

  const vo = await loadVo(voId, ctx.tenantId)
  if (!vo) return { error: 'VO not found' }
  if (vo.status !== 'draft') return { error: 'VO is not in draft' }

  await db
    .update(variationOrders)
    .set({ status: 'pending_commercial_pricing' })
    .where(and(eq(variationOrders.id, voId), eq(variationOrders.tenant_id, ctx.tenantId)))

  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    entityType: 'variation_order',
    entityId: voId,
    action: 'status_change',
    diff: { from: 'draft', to: 'pending_commercial_pricing' },
  })

  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, vo.project_id), eq(projects.tenant_id, ctx.tenantId)))
    .limit(1)

  await notifyRoles({
    tenantId: ctx.tenantId,
    recipientRoles: ['commercial'],
    subject: `VO ${vo.vo_number} pending commercial pricing`,
    body: `${project?.name ?? 'Project'} — ${vo.description.slice(0, 140)}`,
    linkUrl: `/projects/${vo.project_id}/vos/${voId}`,
    payload: { vo_id: voId, vo_number: vo.vo_number },
  })

  revalidatePath(`/projects/${vo.project_id}/vos`)
  revalidatePath(`/projects/${vo.project_id}/vos/${voId}`)
  return {}
}

export async function submitVoForClientSignature(
  voId: string,
): Promise<{ error?: string; url?: string }> {
  const ctx = await getTenantContext()
  if ('error' in ctx) return { error: ctx.error }
  if (!can(ctx.role, 'variation_order.send_for_client_signature')) {
    return { error: 'Forbidden: your role cannot send variation orders for client signature.' }
  }

  const vo = await loadVo(voId, ctx.tenantId)
  if (!vo) return { error: 'VO not found' }
  if (vo.status !== 'pending_commercial_pricing') {
    return { error: 'VO must be priced by commercial first' }
  }

  const signatory = await resolvePrimaryClientSignatory(
    ctx.tenantId,
    vo.project_id
  )
  if (!signatory) {
    return {
      error:
        'Add a primary client contact with a valid email to the project account before sending this VO for signature.',
    }
  }

  const session = await createSigningSession({
    tenantId: ctx.tenantId,
    entityType: 'variation_order',
    entityId: voId,
    signerEmail: signatory.email,
    signerName: signatory.name,
  })

  await db
    .update(variationOrders)
    .set({
      status: 'pending_client_signature',
      docuseal_submission_id:
        session.mechanism === 'docuseal' ? session.submissionId : null,
    })
    .where(and(eq(variationOrders.id, voId), eq(variationOrders.tenant_id, ctx.tenantId)))

  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    entityType: 'variation_order',
    entityId: voId,
    action: 'status_change',
    diff: {
      from: 'pending_commercial_pricing',
      to: 'pending_client_signature',
      signing_url: session.url,
      mechanism: session.mechanism,
      is_dev_stub: session.is_dev_stub,
    },
  })

  revalidatePath(`/projects/${vo.project_id}/vos`)
  revalidatePath(`/projects/${vo.project_id}/vos/${voId}`)
  return { url: session.url }
}

export async function recordVoSigned(
  voId: string,
  signedDocumentId: string | null,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  if ('error' in ctx) return { error: ctx.error }
  if (!can(ctx.role, 'variation_order.send_for_client_signature')) {
    return { error: 'Forbidden: your role cannot record a variation-order signature.' }
  }

  const vo = await loadVo(voId, ctx.tenantId)
  if (!vo) return { error: 'VO not found' }
  if (vo.status === 'signed') return {}

  await db
    .update(variationOrders)
    .set({
      status: 'signed',
      signed_at: new Date(),
      signed_document_id: signedDocumentId,
    })
    .where(and(eq(variationOrders.id, voId), eq(variationOrders.tenant_id, ctx.tenantId)))

  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    entityType: 'variation_order',
    entityId: voId,
    action: 'status_change',
    diff: {
      from: vo.status,
      to: 'signed',
      signed_document_id: signedDocumentId,
    },
  })

  revalidatePath(`/projects/${vo.project_id}/vos`)
  revalidatePath(`/projects/${vo.project_id}/vos/${voId}`)
  return {}
}

export async function rejectVo(
  voId: string,
  reason: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  if ('error' in ctx) return { error: ctx.error }
  if (!can(ctx.role, 'variation_order.reject')) {
    return { error: 'Forbidden: your role cannot reject variation orders.' }
  }

  const vo = await loadVo(voId, ctx.tenantId)
  if (!vo) return { error: 'VO not found' }
  if (vo.status === 'signed' || vo.status === 'rejected') {
    return { error: 'VO is already finalized' }
  }

  const trimmed = reason.trim()
  if (!trimmed) return { error: 'Rejection reason is required' }

  await db
    .update(variationOrders)
    .set({ status: 'rejected' })
    .where(and(eq(variationOrders.id, voId), eq(variationOrders.tenant_id, ctx.tenantId)))

  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    entityType: 'variation_order',
    entityId: voId,
    action: 'status_change',
    diff: { from: vo.status, to: 'rejected', reason: trimmed },
  })

  revalidatePath(`/projects/${vo.project_id}/vos`)
  revalidatePath(`/projects/${vo.project_id}/vos/${voId}`)
  return {}
}

/** Loader used by the list page. Returns cumulative totals. */
export async function listProjectVos(projectId: string, tenantId: string) {
  const rows = await db
    .select()
    .from(variationOrders)
    .where(
      and(
        eq(variationOrders.project_id, projectId),
        eq(variationOrders.tenant_id, tenantId),
      ),
    )
    .orderBy(asc(variationOrders.vo_number))

  const totals = rows.reduce(
    (acc, r) => ({
      cost_impact_cents: acc.cost_impact_cents + r.cost_impact_cents,
      time_impact_days: acc.time_impact_days + r.time_impact_days,
    }),
    { cost_impact_cents: 0, time_impact_days: 0 },
  )

  return { rows, totals }
}

export async function getVoById(voId: string, tenantId: string) {
  return loadVo(voId, tenantId)
}
