'use server'

import crypto from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db, type Database } from '@third-code-erp/database'
import {
  signatureSessions,
  documents,
  boms,
  contracts,
  variationOrders,
  certificatesOfCompletion,
} from '@third-code-erp/database/schema'
import { createSupabaseAdminClient } from '@third-code-erp/auth'
import { hashToken } from '@/lib/operations/integrations/canvas-sign'
import { writeAuditLogInTransaction } from '@/lib/audit'

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

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type SigningSession = typeof signatureSessions.$inferSelect

const SIGNATURE_DATA_URL_PREFIX = 'data:image/png;base64,'
const MAX_SIGNATURE_BYTES = 512 * 1024
const MAX_SIGNATURE_BASE64_LENGTH = Math.ceil(MAX_SIGNATURE_BYTES / 3) * 4
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex')

class PublicSigningError extends Error {}

function decodeSignaturePng(
  dataUrl: string | null | undefined
): { bytes: Buffer } | { error: string } {
  if (!dataUrl?.startsWith(SIGNATURE_DATA_URL_PREFIX)) {
    return { error: 'Signature image required.' }
  }

  const encoded = dataUrl.slice(SIGNATURE_DATA_URL_PREFIX.length)
  if (encoded.length > MAX_SIGNATURE_BASE64_LENGTH) {
    return { error: 'Signature image is too large.' }
  }
  if (
    encoded.length === 0 ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  ) {
    return { error: 'Signature image is invalid.' }
  }

  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length > MAX_SIGNATURE_BYTES) {
    return { error: 'Signature image is too large.' }
  }
  if (
    bytes.length < 300 ||
    bytes.length < PNG_SIGNATURE.length ||
    !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    return {
      error:
        bytes.length < 300
          ? 'Signature looks empty. Please draw and try again.'
          : 'Signature image is invalid.',
    }
  }

  return { bytes }
}

function signingSessionError(
  session: SigningSession | undefined,
  now: Date
): string | null {
  if (!session) return 'Invalid signing link.'
  if (session.signed_at) return 'Already signed.'
  if (session.revoked_at) return 'Link revoked.'
  if (new Date(session.expires_at).getTime() <= now.getTime()) {
    return 'Link expired.'
  }
  return null
}

async function stampSignedSource(
  tx: DatabaseTransaction,
  session: SigningSession,
  signatureDocumentId: string,
  now: Date
): Promise<boolean> {
  if (session.entity_type === 'bom') {
    const rows = await tx
      .update(boms)
      .set({ status: 'locked', locked_at: now, updated_at: now })
      .where(
        and(
          eq(boms.id, session.entity_id),
          eq(boms.tenant_id, session.tenant_id)
        )
      )
      .returning({ id: boms.id })
    return rows.length === 1
  }

  if (session.entity_type === 'contract') {
    const rows = await tx
      .update(contracts)
      .set({
        status: 'signed',
        signed_at: now,
        signed_document_id: signatureDocumentId,
        updated_at: now,
      })
      .where(
        and(
          eq(contracts.id, session.entity_id),
          eq(contracts.tenant_id, session.tenant_id)
        )
      )
      .returning({ id: contracts.id })
    return rows.length === 1
  }

  if (session.entity_type === 'variation_order') {
    const rows = await tx
      .update(variationOrders)
      .set({
        status: 'signed',
        signed_at: now,
        signed_document_id: signatureDocumentId,
      })
      .where(
        and(
          eq(variationOrders.id, session.entity_id),
          eq(variationOrders.tenant_id, session.tenant_id)
        )
      )
      .returning({ id: variationOrders.id })
    return rows.length === 1
  }

  if (session.entity_type === 'coc') {
    const warrantyEnd = new Date(now.getTime() + 365 * 86_400_000)
    const rows = await tx
      .update(certificatesOfCompletion)
      .set({
        status: 'signed',
        signed_at: now,
        signed_document_id: signatureDocumentId,
        warranty_period_starts_at: now,
        warranty_period_ends_at: warrantyEnd,
      })
      .where(
        and(
          eq(certificatesOfCompletion.id, session.entity_id),
          eq(certificatesOfCompletion.tenant_id, session.tenant_id)
        )
      )
      .returning({ id: certificatesOfCompletion.id })
    return rows.length === 1
  }

  return false
}

async function removeUploadedSignature(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  objectKey: string
): Promise<void> {
  try {
    const { error } = await admin.storage
      .from('documents')
      .remove([objectKey])
    if (error) {
      console.warn('[canvas-sign] signature cleanup failed')
    }
  } catch {
    console.warn('[canvas-sign] signature cleanup failed')
  }
}

/**
 * Records a client signature submitted via the canvas pad.
 *
 * Steps:
 *   1. Look up signature_session by hashed token.
 *   2. Validate (not signed, not expired, not revoked).
 *   3. Decode PNG and upload it under a collision-resistant Storage key.
 *   4. Lock and revalidate the signing session inside one DB transaction.
 *   5. Insert the document and stamp both session and tenant-scoped source.
 *   6. Insert the nullable-actor audit before the same transaction commits.
 *   7. Remove the uploaded object if the DB transaction fails.
 *
 * Tenant_id is read from the session row — never from caller input.
 */
export async function recordCanvasSign(input: SignInput): Promise<SignResult> {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Invalid signing request.' }
  }

  const signerName =
    typeof input.signerName === 'string' ? input.signerName.trim() : ''
  const signerEmail =
    typeof input.signerEmail === 'string'
      ? input.signerEmail.trim() || null
      : null
  if (!signerName) {
    return { ok: false, error: 'Signer name required.' }
  }
  if (signerName.length > 255) {
    return { ok: false, error: 'Signer name is too long.' }
  }
  if (signerEmail && signerEmail.length > 255) {
    return { ok: false, error: 'Signer email is too long.' }
  }
  if (
    typeof input.token !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(input.token)
  ) {
    return { ok: false, error: 'Invalid signing link.' }
  }

  const decoded = decodeSignaturePng(
    typeof input.signatureDataUrl === 'string'
      ? input.signatureDataUrl
      : undefined
  )
  if ('error' in decoded) return { ok: false, error: decoded.error }

  const tokenHash = hashToken(input.token)
  const [session] = await db
    .select()
    .from(signatureSessions)
    .where(eq(signatureSessions.token_hash, tokenHash))
    .limit(1)

  if (!session) return { ok: false, error: 'Invalid signing link.' }
  const initialStateError = signingSessionError(session, new Date())
  if (initialStateError) return { ok: false, error: initialStateError }

  const projectId = await resolveProjectId(
    session.tenant_id,
    session.entity_type,
    session.entity_id
  )
  if (!projectId) {
    return { ok: false, error: 'Source entity not found.' }
  }

  const admin = createSupabaseAdminClient()
  const objectKey =
    `${session.tenant_id}/signatures/${session.entity_type}/` +
    `${session.entity_id}/${crypto.randomUUID()}.png`

  try {
    const { error } = await admin.storage
      .from('documents')
      .upload(objectKey, decoded.bytes, {
        contentType: 'image/png',
        upsert: false,
      })
    if (error) {
      return {
        ok: false,
        error: 'Storage upload failed. Please try again.',
      }
    }
  } catch {
    await removeUploadedSignature(admin, objectKey)
    return { ok: false, error: 'Storage upload failed. Please try again.' }
  }

  try {
    await db.transaction(async (tx) => {
      const [lockedSession] = await tx
        .select()
        .from(signatureSessions)
        .where(
          and(
            eq(signatureSessions.id, session.id),
            eq(signatureSessions.tenant_id, session.tenant_id),
            eq(signatureSessions.token_hash, tokenHash)
          )
        )
        .limit(1)
        .for('update')

      if (!lockedSession) {
        throw new PublicSigningError('Invalid signing link.')
      }
      const signedAt = new Date()
      const lockedStateError = signingSessionError(lockedSession, signedAt)
      if (lockedStateError) throw new PublicSigningError(lockedStateError)

      const [document] = await tx
        .insert(documents)
        .values({
          tenant_id: lockedSession.tenant_id,
          project_id: projectId,
          document_type: 'other',
          file_name:
            `signature-${lockedSession.entity_type}-` +
            `${signedAt.getTime()}.png`,
          storage_path: objectKey,
          mime_type: 'image/png',
          size_bytes: decoded.bytes.length,
          description:
            `Client signature for ${lockedSession.entity_type} ` +
            `${lockedSession.entity_id} by ${signerName}`,
        })
        .returning({ id: documents.id })
      if (!document) throw new Error('Signature document insert failed')

      const sourceStamped = await stampSignedSource(
        tx,
        lockedSession,
        document.id,
        signedAt
      )
      if (!sourceStamped) {
        throw new PublicSigningError('Source entity not found.')
      }

      const updatedSessions = await tx
        .update(signatureSessions)
        .set({
          signed_at: signedAt,
          signer_name: signerName,
          signer_email: signerEmail,
          signature_document_id: document.id,
        })
        .where(
          and(
            eq(signatureSessions.id, lockedSession.id),
            eq(signatureSessions.tenant_id, lockedSession.tenant_id),
            eq(signatureSessions.token_hash, tokenHash)
          )
        )
        .returning({ id: signatureSessions.id })
      if (updatedSessions.length !== 1) {
        throw new PublicSigningError('Invalid signing link.')
      }

      await writeAuditLogInTransaction(tx, {
        tenantId: lockedSession.tenant_id,
        actorId: null,
        entityType: lockedSession.entity_type,
        entityId: lockedSession.entity_id,
        action: 'approve',
        diff: {
          signed_by: signerName,
          signer_email: signerEmail,
          signature_document_id: document.id,
          mechanism: 'canvas_sign',
        },
      })
    })

    return { ok: true }
  } catch (error) {
    await removeUploadedSignature(admin, objectKey)
    if (error instanceof PublicSigningError) {
      return { ok: false, error: error.message }
    }
    console.error('[canvas-sign] signature transaction failed')
    return {
      ok: false,
      error: 'Could not record signature. Try again.',
    }
  }
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
