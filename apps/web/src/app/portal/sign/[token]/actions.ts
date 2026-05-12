'use server'

import crypto from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@buildops/database'
import {
  signatureSessions,
  documents,
  boms,
  contracts,
  variationOrders,
  certificatesOfCompletion,
} from '@buildops/database/schema'
import { createSupabaseAdminClient } from '@buildops/auth'
import { hashToken } from '@/lib/abi/integrations/canvas-sign'
import { writeAuditLog } from '@/lib/audit'

interface SignInput {
  token: string
  signerName: string
  signerEmail: string
  signatureDataUrl: string // image/png;base64,...
}

interface SignResult {
  ok: boolean
  error?: string
}

/**
 * Records a client signature submitted via the canvas pad.
 *
 * Steps:
 *   1. Look up signature_session by hashed token.
 *   2. Validate (not signed, not expired, not revoked).
 *   3. Decode PNG, upload to Storage at signatures/<tenant>/<entity>/<ts>.png.
 *   4. Insert a documents row with document_type='other'.
 *   5. Stamp signature_sessions.signed_at + signer info.
 *   6. Stamp the source entity's signed_at + signed_document_id.
 *   7. Audit-log on the entity_type with action='approve'.
 *
 * Tenant_id is read from the session row — never from caller input.
 */
export async function recordCanvasSign(input: SignInput): Promise<SignResult> {
  if (!input.signatureDataUrl?.startsWith('data:image/png;base64,')) {
    return { ok: false, error: 'Signature image required.' }
  }
  if (!input.signerName?.trim()) {
    return { ok: false, error: 'Signer name required.' }
  }

  const tokenHash = hashToken(input.token)
  const [session] = await db
    .select()
    .from(signatureSessions)
    .where(eq(signatureSessions.token_hash, tokenHash))
    .limit(1)

  if (!session) return { ok: false, error: 'Invalid signing link.' }
  if (session.signed_at) return { ok: false, error: 'Already signed.' }
  if (session.revoked_at) return { ok: false, error: 'Link revoked.' }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'Link expired.' }
  }

  // Decode signature PNG.
  const b64 = input.signatureDataUrl.replace(/^data:image\/png;base64,/, '')
  const pngBytes = Buffer.from(b64, 'base64')
  if (pngBytes.length < 300) {
    return { ok: false, error: 'Signature looks empty. Please draw and try again.' }
  }

  // Upload to Storage.
  const admin = createSupabaseAdminClient()
  const ts = Date.now()
  const objectKey = `${session.tenant_id}/signatures/${session.entity_type}/${session.entity_id}/${ts}.png`

  const { error: uploadErr } = await admin.storage
    .from('documents')
    .upload(objectKey, pngBytes, {
      contentType: 'image/png',
      upsert: false,
    })
  if (uploadErr) {
    return { ok: false, error: `Storage upload failed: ${uploadErr.message}` }
  }

  // Document row.
  // Note: the documents table requires project_id NOT NULL. For BOM /
  // contract / VO / COC we can derive it from the source entity.
  const projectId = await resolveProjectId(session.tenant_id, session.entity_type, session.entity_id)
  if (!projectId) {
    return { ok: false, error: 'Source entity not found.' }
  }

  const [doc] = await db
    .insert(documents)
    .values({
      tenant_id: session.tenant_id,
      project_id: projectId,
      document_type: 'other',
      file_name: `signature-${session.entity_type}-${ts}.png`,
      storage_path: objectKey,
      mime_type: 'image/png',
      size_bytes: pngBytes.length,
      description: `Client signature for ${session.entity_type} ${session.entity_id} by ${input.signerName}`,
    })
    .returning({ id: documents.id })

  const signatureDocumentId = doc!.id
  const now = new Date()

  // Stamp the signature session.
  await db
    .update(signatureSessions)
    .set({
      signed_at: now,
      signer_name: input.signerName.trim(),
      signer_email: input.signerEmail.trim() || null,
      signature_document_id: signatureDocumentId,
    })
    .where(eq(signatureSessions.id, session.id))

  // Stamp the source entity.
  if (session.entity_type === 'bom') {
    await db
      .update(boms)
      .set({ status: 'locked', locked_at: now, updated_at: now })
      .where(eq(boms.id, session.entity_id))
  } else if (session.entity_type === 'contract') {
    await db
      .update(contracts)
      .set({
        status: 'signed',
        signed_at: now,
        signed_document_id: signatureDocumentId,
        updated_at: now,
      })
      .where(eq(contracts.id, session.entity_id))
  } else if (session.entity_type === 'variation_order') {
    await db
      .update(variationOrders)
      .set({
        status: 'signed',
        signed_at: now,
        signed_document_id: signatureDocumentId,
      })
      .where(eq(variationOrders.id, session.entity_id))
  } else if (session.entity_type === 'coc') {
    const warrantyEnd = new Date(now.getTime() + 365 * 86_400_000)
    await db
      .update(certificatesOfCompletion)
      .set({
        status: 'signed',
        signed_at: now,
        signed_document_id: signatureDocumentId,
        warranty_period_starts_at: now,
        warranty_period_ends_at: warrantyEnd,
      })
      .where(eq(certificatesOfCompletion.id, session.entity_id))
  }

  // Audit (public flow has no user — actor_id null).
  await writeAuditLog({
    tenantId: session.tenant_id,
    actorId: '00000000-0000-0000-0000-000000000000', // placeholder for public actions
    entityType: session.entity_type,
    entityId: session.entity_id,
    action: 'approve',
    diff: {
      signed_by: input.signerName.trim(),
      signer_email: input.signerEmail.trim(),
      signature_document_id: signatureDocumentId,
      mechanism: 'canvas_sign',
    },
  }).catch(() => {
    // Audit log requires a valid actor_id FK. If the placeholder fails,
    // we don't want to undo the sign. Swallow + log to stderr.
    // eslint-disable-next-line no-console
    console.warn('[canvas-sign] audit_log insert failed; sign still recorded')
  })

  return { ok: true }
}

async function resolveProjectId(
  tenantId: string,
  entityType: string,
  entityId: string
): Promise<string | null> {
  if (entityType === 'bom') {
    const [r] = await db
      .select({ project_id: boms.project_id })
      .from(boms)
      .where(and(eq(boms.id, entityId), eq(boms.tenant_id, tenantId)))
      .limit(1)
    return r?.project_id ?? null
  }
  if (entityType === 'contract') {
    const [r] = await db
      .select({ project_id: contracts.project_id })
      .from(contracts)
      .where(and(eq(contracts.id, entityId), eq(contracts.tenant_id, tenantId)))
      .limit(1)
    return r?.project_id ?? null
  }
  if (entityType === 'variation_order') {
    const [r] = await db
      .select({ project_id: variationOrders.project_id })
      .from(variationOrders)
      .where(and(eq(variationOrders.id, entityId), eq(variationOrders.tenant_id, tenantId)))
      .limit(1)
    return r?.project_id ?? null
  }
  if (entityType === 'coc') {
    const [r] = await db
      .select({ project_id: certificatesOfCompletion.project_id })
      .from(certificatesOfCompletion)
      .where(and(eq(certificatesOfCompletion.id, entityId), eq(certificatesOfCompletion.tenant_id, tenantId)))
      .limit(1)
    return r?.project_id ?? null
  }
  return null
}
