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
import { and, count, eq } from 'drizzle-orm'
import { can, getUserProfile, type AppRole } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  documents,
  projects,
  users,
  variationOrders,
} from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { notifyRoles } from '@/lib/operations/notifications'
import { createSigningSession } from '@/lib/operations/integrations/docuseal'
import { revokeOpenSigningSessions } from '@/lib/operations/signing-sessions'
import { loadVo } from './queries'

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

export interface VoSigningLinkResult {
  error?: string
  /** One-time signing link. Shown to the sender once; never stored or logged. */
  url?: string
  expiresAt?: string
}

// Matches the createCanvasSignSession default; shown to the sender.
const SIGNING_LINK_HOURS = 48

// Shared by send (from pending_commercial_pricing) and resend (from
// pending_client_signature). The link is a bearer credential: it only goes
// back to the caller, never into the audit log.
async function issueVoSigningLink(
  ctx: TenantCtx,
  vo: { id: string; project_id: string; created_by: string | null },
  from: 'pending_commercial_pricing' | 'pending_client_signature',
): Promise<VoSigningLinkResult> {
  // Resolve a client signer email. The schema doesn't store a per-project
  // signer, so we fall back to the creating user — this keeps the dev-mode
  // submission flow working end-to-end without coupling to client records.
  let signerEmail = 'client@unknown.local'
  if (vo.created_by) {
    const [creator] = await db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.id, vo.created_by), eq(users.tenant_id, ctx.tenantId)))
      .limit(1)
    if (creator?.email) signerEmail = creator.email
  }

  let session: Awaited<ReturnType<typeof createSigningSession>>
  try {
    session = await createSigningSession({
      tenantId: ctx.tenantId,
      entityType: 'variation_order',
      entityId: vo.id,
      signerEmail,
    })
  } catch {
    console.error('[vo] signing session creation failed')
    return { error: 'The signing link could not be created. Try again.' }
  }

  const moved = await db
    .update(variationOrders)
    .set({
      status: 'pending_client_signature',
      docuseal_submission_id:
        session.mechanism === 'docuseal' ? session.token : null,
    })
    .where(
      and(
        eq(variationOrders.id, vo.id),
        eq(variationOrders.tenant_id, ctx.tenantId),
        eq(variationOrders.status, from),
      ),
    )
    .returning({ id: variationOrders.id })
  if (moved.length !== 1) {
    return {
      error: 'The variation order changed while the link was being created. Refresh the page and check its status.',
    }
  }

  // Only the newest link may sign; kept after the update so a failed reissue
  // never leaves the variation order without a working link. A first send
  // revokes too: a link minted by a request that lost a race is never reused.
  await revokeOpenSigningSessions(ctx.tenantId, 'variation_order', vo.id, session.token)

  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    entityType: 'variation_order',
    entityId: vo.id,
    action: 'status_change',
    diff: {
      from,
      to: 'pending_client_signature',
      ...(from === 'pending_client_signature'
        ? { signing_link: 'reissued', previous_links_revoked: true }
        : {}),
      // The signing link is a bearer credential; audit rows are tenant-readable.
      mechanism: session.mechanism,
      is_dev_stub: session.is_dev_stub,
    },
  })

  revalidatePath(`/projects/${vo.project_id}/vos`)
  revalidatePath(`/projects/${vo.project_id}/vos/${vo.id}`)
  return {
    url: session.url,
    expiresAt: new Date(Date.now() + SIGNING_LINK_HOURS * 60 * 60 * 1000).toISOString(),
  }
}

export async function submitVoForClientSignature(
  voId: string,
): Promise<VoSigningLinkResult> {
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

  return issueVoSigningLink(ctx, vo, 'pending_commercial_pricing')
}

// Links expire after 48 hours; without this a pending VO is stuck.
export async function resendVoSigningLink(
  voId: string,
): Promise<VoSigningLinkResult> {
  const ctx = await getTenantContext()
  if ('error' in ctx) return { error: ctx.error }
  if (!can(ctx.role, 'variation_order.send_for_client_signature')) {
    return { error: 'Forbidden: your role cannot send variation orders for client signature.' }
  }

  const vo = await loadVo(voId, ctx.tenantId)
  if (!vo) return { error: 'VO not found' }
  if (vo.status !== 'pending_client_signature') {
    return { error: 'A new signing link can only be created while the VO is waiting for client signature.' }
  }

  return issueVoSigningLink(ctx, vo, 'pending_client_signature')
}

// Withdraws the signing request: the link stops working and the VO goes back
// to commercial pricing, where it can be corrected and sent again.
export async function cancelVoSigningRequest(
  voId: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  if ('error' in ctx) return { error: ctx.error }
  if (!can(ctx.role, 'variation_order.send_for_client_signature')) {
    return { error: 'Forbidden: your role cannot send variation orders for client signature.' }
  }

  const vo = await loadVo(voId, ctx.tenantId)
  if (!vo) return { error: 'VO not found' }
  if (vo.status !== 'pending_client_signature') {
    return { error: 'Only a VO that is waiting for client signature can have its request cancelled.' }
  }

  // The status guard makes a signature that lands first win over the cancel.
  const reverted = await db
    .update(variationOrders)
    .set({ status: 'pending_commercial_pricing', docuseal_submission_id: null })
    .where(
      and(
        eq(variationOrders.id, voId),
        eq(variationOrders.tenant_id, ctx.tenantId),
        eq(variationOrders.status, 'pending_client_signature'),
      ),
    )
    .returning({ id: variationOrders.id })
  if (reverted.length !== 1) {
    return { error: 'The VO is no longer waiting for client signature. Refresh the page.' }
  }

  await revokeOpenSigningSessions(ctx.tenantId, 'variation_order', voId)

  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    entityType: 'variation_order',
    entityId: voId,
    action: 'status_change',
    diff: {
      from: 'pending_client_signature',
      to: 'pending_commercial_pricing',
      signing_link: 'revoked',
    },
  })

  revalidatePath(`/projects/${vo.project_id}/vos`)
  revalidatePath(`/projects/${vo.project_id}/vos/${voId}`)
  return {}
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
  if (vo.status !== 'pending_client_signature') {
    return { error: 'VO must be awaiting client signature before it can be signed' }
  }

  if (signedDocumentId) {
    const [document] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, signedDocumentId), eq(documents.tenant_id, ctx.tenantId)))
      .limit(1)
    if (!document) return { error: 'Signed document not found in this tenant' }
  }

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

  // A rejected VO must not stay signable through a link that is already out.
  await revokeOpenSigningSessions(ctx.tenantId, 'variation_order', voId)

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
