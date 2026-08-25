import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  boms,
  certificatesOfCompletion,
  contracts,
  documents,
  publicSigningRequests,
  signatureSessions,
  variationOrders,
} from '@third-code-erp/database/schema'
import {
  publicSigningCommandSchema,
  publicSigningResultSchema,
  type PublicSigningBody,
  type PublicSigningResult,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import { lockProjectDocumentStorageForCreate } from './document-storage-quota'
import { PublicSigningStorageService } from './public-signing.storage'

const SIGNATURE_DATA_URL_PREFIX = 'data:image/png;base64,'
const MAX_SIGNATURE_BYTES = 512 * 1024
const MAX_SIGNATURE_BASE64_LENGTH = Math.ceil(MAX_SIGNATURE_BYTES / 3) * 4
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex')

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function commandHash(tokenHash: string, body: PublicSigningBody): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        tokenHash,
        signerName: body.signerName,
        signerEmail: body.signerEmail ?? null,
        signatureDataUrl: body.signatureDataUrl,
      })
    )
    .digest('hex')
}

function validateKey(raw: string): string {
  const key = raw.trim()
  if (!key || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function decodeSignaturePng(dataUrl: string): Buffer {
  if (!dataUrl.startsWith(SIGNATURE_DATA_URL_PREFIX)) {
    throw new BadRequestException('Signature image required.')
  }
  const encoded = dataUrl.slice(SIGNATURE_DATA_URL_PREFIX.length)
  if (
    encoded.length === 0 ||
    encoded.length > MAX_SIGNATURE_BASE64_LENGTH ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  ) {
    throw new BadRequestException('Signature image is invalid.')
  }
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length > MAX_SIGNATURE_BYTES) {
    throw new BadRequestException('Signature image is too large.')
  }
  if (bytes.length < 300) {
    throw new BadRequestException('Signature looks empty. Please draw and try again.')
  }
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new BadRequestException('Signature image is invalid.')
  }
  return bytes
}

function replayResult(value: unknown): PublicSigningResult {
  const parsed = publicSigningResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Public signing idempotency result is invalid'
    )
  }
  return parsed.data
}

function stateError(
  session: { signed_at: Date | string | null; revoked_at: Date | string | null; expires_at: Date | string },
  now: Date
): string | null {
  if (session.signed_at) return 'Already signed.'
  if (session.revoked_at) return 'Link revoked.'
  if (new Date(session.expires_at).getTime() <= now.getTime()) {
    return 'Link expired.'
  }
  return null
}

@Injectable()
export class PublicSigningService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PublicSigningStorageService)
    private readonly storage: PublicSigningStorageService
  ) {}

  async sign(
    rawToken: string,
    body: PublicSigningBody,
    rawIdempotencyKey: string
  ): Promise<PublicSigningResult> {
    const command = publicSigningCommandSchema.parse({
      token: rawToken,
      ...body,
    })
    const idempotencyKey = validateKey(rawIdempotencyKey)
    if (!this.config.get<boolean>('ERP_PUBLIC_SIGNING_WRITES_ENABLED', false)) {
      throw new ServiceUnavailableException(
        'Public signing is not enabled; no signature was recorded.'
      )
    }

    const tenantIds = this.config.get<string[]>(
      'ERP_PUBLIC_SIGNING_WRITES_TENANT_IDS',
      []
    )
    if (tenantIds.length === 0) {
      throw new ServiceUnavailableException(
        'Public signing is not enabled for this tenant; no signature was recorded.'
      )
    }

    const tokenHash = hashToken(command.token)
    const [session] = await this.database.client
      .select()
      .from(signatureSessions)
      .where(eq(signatureSessions.token_hash, tokenHash))
      .limit(1)
    if (!session) throw new NotFoundException('Invalid signing link.')

    if (!tenantIds.includes(session.tenant_id)) {
      throw new ServiceUnavailableException(
        'Public signing is not enabled for this tenant; no signature was recorded.'
      )
    }

    const expectedSignerEmail = session.signer_email?.trim().toLowerCase()
    if (
      expectedSignerEmail &&
      command.signerEmail !== expectedSignerEmail
    ) {
      throw new ForbiddenException(
        'Signer email does not match this signing invitation.'
      )
    }

    const requestHash = commandHash(tokenHash, {
      signerName: command.signerName,
      signerEmail: command.signerEmail,
      signatureDataUrl: command.signatureDataUrl,
    })
    const [existing] = await this.database.client
      .select({
        requestHash: publicSigningRequests.request_hash,
        state: publicSigningRequests.state,
        result: publicSigningRequests.result,
      })
      .from(publicSigningRequests)
      .where(
        and(
          eq(publicSigningRequests.tenant_id, session.tenant_id),
          eq(publicSigningRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different signature command'
        )
      }
      if (existing.state === 'succeeded') return replayResult(existing.result)
    }

    const initialError = stateError(session, new Date())
    if (initialError) throw new ConflictException(initialError)

    const sourceProjectId = await this.resolveProjectId(
      this.database.client,
      session.tenant_id,
      session.entity_type,
      session.entity_id
    )
    if (!sourceProjectId) throw new NotFoundException('Source entity not found.')

    const bytes = decodeSignaturePng(command.signatureDataUrl)
    const objectKey =
      `${session.tenant_id}/signatures/${session.entity_type}/` +
      `${session.entity_id}/core-${requestHash}.png`

    try {
      await this.storage.upload(objectKey, bytes)
      const result = await this.database.client.transaction((transaction) =>
        this.commit(
          transaction,
          session.id,
          session.tenant_id,
          tokenHash,
          objectKey,
          bytes.length,
          command,
          idempotencyKey,
          requestHash
        )
      )
      return result
    } catch (error) {
      if (await this.canRemoveUploadedObject(session.tenant_id, requestHash)) {
        await this.storage.remove(objectKey)
      }
      throw error
    }
  }

  /**
   * A concurrent retry may have uploaded the same deterministic object for a
   * request that is still committing (or has already committed). Never
   * delete an object while a matching replay ledger row can still own it.
   * If the read is unavailable, retain the object for an operator cleanup
   * job rather than risking deletion of a valid signature.
   */
  private async canRemoveUploadedObject(
    tenantId: string,
    requestHash: string
  ): Promise<boolean> {
    try {
      const [request] = await this.database.client
        .select({ state: publicSigningRequests.state })
        .from(publicSigningRequests)
        .where(
          and(
            eq(publicSigningRequests.tenant_id, tenantId),
            eq(publicSigningRequests.request_hash, requestHash)
          )
        )
        .limit(1)
      return !request
    } catch {
      return false
    }
  }

  private async commit(
    transaction: DatabaseTransaction,
    sessionId: string,
    tenantId: string,
    tokenHash: string,
    objectKey: string,
    sizeBytes: number,
    command: { signerName: string; signerEmail?: string | null },
    idempotencyKey: string,
    requestHash: string
  ): Promise<PublicSigningResult> {
    const [lockedSession] = await transaction
      .select()
      .from(signatureSessions)
      .where(
        and(
          eq(signatureSessions.id, sessionId),
          eq(signatureSessions.tenant_id, tenantId),
          eq(signatureSessions.token_hash, tokenHash)
        )
      )
      .limit(1)
      .for('update')
    if (!lockedSession) throw new NotFoundException('Invalid signing link.')

    await transaction
      .insert(publicSigningRequests)
      .values({
        tenant_id: tenantId,
        signature_session_id: sessionId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
      })
      .onConflictDoNothing({
        target: [
          publicSigningRequests.tenant_id,
          publicSigningRequests.idempotency_key,
        ],
      })

    const [request] = await transaction
      .select({
        id: publicSigningRequests.id,
        requestHash: publicSigningRequests.request_hash,
        state: publicSigningRequests.state,
        result: publicSigningRequests.result,
      })
      .from(publicSigningRequests)
      .where(
        and(
          eq(publicSigningRequests.tenant_id, tenantId),
          eq(publicSigningRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Public signing idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different signature command'
      )
    }
    if (request.state === 'succeeded') return replayResult(request.result)

    const lockedStateError = stateError(lockedSession, new Date())
    if (lockedStateError) throw new ConflictException(lockedStateError)

    const projectId = await this.lockSourceProject(transaction, lockedSession)
    if (!projectId) throw new NotFoundException('Source entity not found.')

    await lockProjectDocumentStorageForCreate(
      transaction,
      { tenantId, projectId },
      sizeBytes
    )

    const signedAt = new Date()
    const documentId = await this.createSignedDocument(
      transaction,
      lockedSession,
      projectId,
      objectKey,
      sizeBytes,
      command.signerName,
      signedAt
    )
    const stamped = await this.stampSignedSource(
      transaction,
      lockedSession,
      documentId,
      signedAt
    )
    if (!stamped) throw new NotFoundException('Source entity not found.')

    const [updatedSession] = await transaction
      .update(signatureSessions)
      .set({
        signed_at: signedAt,
        signer_name: command.signerName,
        signer_email: command.signerEmail ?? null,
        signature_document_id: documentId,
      })
      .where(
        and(
          eq(signatureSessions.id, lockedSession.id),
          eq(signatureSessions.tenant_id, tenantId),
          eq(signatureSessions.token_hash, tokenHash)
        )
      )
      .returning({ id: signatureSessions.id })
    if (!updatedSession) throw new ConflictException('Invalid signing link.')

    const result = publicSigningResultSchema.parse({
      sessionId,
      tenantId,
      entityType: lockedSession.entity_type,
      entityId: lockedSession.entity_id,
      signatureDocumentId: documentId,
      signedAt: signedAt.toISOString(),
    })
    const [completedRequest] = await transaction
      .update(publicSigningRequests)
      .set({ state: 'succeeded', result, completed_at: signedAt })
      .where(
        and(
          eq(publicSigningRequests.id, request.id),
          eq(publicSigningRequests.state, 'processing')
        )
      )
      .returning({ id: publicSigningRequests.id })
    if (!completedRequest) {
      throw new InternalServerErrorException(
        'Public signing idempotency record was not completed'
      )
    }
    await this.audit.writeSemantic(transaction, {
      tenantId,
      actorId: null,
      entityType: lockedSession.entity_type,
      entityId: lockedSession.entity_id,
      action: 'approve',
      diff: {
        signed_by: command.signerName,
        signer_email: command.signerEmail ?? null,
        signature_document_id: documentId,
        mechanism: 'canvas_sign_core',
        idempotency_key_hash: requestHash,
      },
    })
    return result
  }

  private async createSignedDocument(
    transaction: DatabaseTransaction,
    session: typeof signatureSessions.$inferSelect,
    projectId: string,
    objectKey: string,
    sizeBytes: number,
    signerName: string,
    signedAt: Date
  ): Promise<string> {
    const [document] = await transaction
      .insert(documents)
      .values({
        tenant_id: session.tenant_id,
        project_id: projectId,
        document_type: 'other',
        file_name: `signature-${session.entity_type}-${signedAt.getTime()}.png`,
        storage_path: objectKey,
        mime_type: 'image/png',
        size_bytes: sizeBytes,
        description: `Client signature for ${session.entity_type} ${session.entity_id} by ${signerName}`,
      })
      .returning({ id: documents.id })
    if (!document) throw new InternalServerErrorException('Signature document insert failed')
    return document.id
  }

  private async stampSignedSource(
    transaction: DatabaseTransaction,
    session: typeof signatureSessions.$inferSelect,
    signatureDocumentId: string,
    now: Date
  ): Promise<boolean> {
    if (session.entity_type === 'bom') {
      const rows = await transaction
        .update(boms)
        .set({ status: 'locked', locked_at: now, updated_at: now })
        .where(and(eq(boms.id, session.entity_id), eq(boms.tenant_id, session.tenant_id)))
        .returning({ id: boms.id })
      return rows.length === 1
    }
    if (session.entity_type === 'contract') {
      const rows = await transaction
        .update(contracts)
        .set({ status: 'signed', signed_at: now, signed_document_id: signatureDocumentId, updated_at: now })
        .where(and(eq(contracts.id, session.entity_id), eq(contracts.tenant_id, session.tenant_id)))
        .returning({ id: contracts.id })
      return rows.length === 1
    }
    if (session.entity_type === 'variation_order') {
      const rows = await transaction
        .update(variationOrders)
        .set({ status: 'signed', signed_at: now, signed_document_id: signatureDocumentId })
        .where(and(eq(variationOrders.id, session.entity_id), eq(variationOrders.tenant_id, session.tenant_id)))
        .returning({ id: variationOrders.id })
      return rows.length === 1
    }
    const warrantyEnd = new Date(now.getTime() + 365 * 86_400_000)
    const rows = await transaction
      .update(certificatesOfCompletion)
      .set({ status: 'signed', signed_at: now, signed_document_id: signatureDocumentId, warranty_period_starts_at: now, warranty_period_ends_at: warrantyEnd })
      .where(and(eq(certificatesOfCompletion.id, session.entity_id), eq(certificatesOfCompletion.tenant_id, session.tenant_id)))
      .returning({ id: certificatesOfCompletion.id })
    return rows.length === 1
  }

  private async resolveProjectId(
    database: Pick<DatabaseService, 'client'>['client'],
    tenantId: string,
    entityType: string,
    entityId: string
  ): Promise<string | null> {
    if (entityType === 'bom') {
      const [row] = await database
        .select({ projectId: boms.project_id })
        .from(boms)
        .where(and(eq(boms.id, entityId), eq(boms.tenant_id, tenantId)))
        .limit(1)
      return row?.projectId ?? null
    }
    if (entityType === 'contract') {
      const [row] = await database
        .select({ projectId: contracts.project_id })
        .from(contracts)
        .where(and(eq(contracts.id, entityId), eq(contracts.tenant_id, tenantId)))
        .limit(1)
      return row?.projectId ?? null
    }
    if (entityType === 'variation_order') {
      const [row] = await database
        .select({ projectId: variationOrders.project_id })
        .from(variationOrders)
        .where(and(eq(variationOrders.id, entityId), eq(variationOrders.tenant_id, tenantId)))
        .limit(1)
      return row?.projectId ?? null
    }
    const [row] = await database
      .select({ projectId: certificatesOfCompletion.project_id })
      .from(certificatesOfCompletion)
      .where(and(eq(certificatesOfCompletion.id, entityId), eq(certificatesOfCompletion.tenant_id, tenantId)))
      .limit(1)
    return row?.projectId ?? null
  }

  /** Locks the exact signable source before the shared project quota lock. */
  private async lockSourceProject(
    transaction: DatabaseTransaction,
    session: typeof signatureSessions.$inferSelect
  ): Promise<string | null> {
    if (session.entity_type === 'bom') {
      const [row] = await transaction
        .select({ projectId: boms.project_id })
        .from(boms)
        .where(
          and(
            eq(boms.id, session.entity_id),
            eq(boms.tenant_id, session.tenant_id)
          )
        )
        .limit(1)
        .for('update')
      return row?.projectId ?? null
    }
    if (session.entity_type === 'contract') {
      const [row] = await transaction
        .select({ projectId: contracts.project_id })
        .from(contracts)
        .where(
          and(
            eq(contracts.id, session.entity_id),
            eq(contracts.tenant_id, session.tenant_id)
          )
        )
        .limit(1)
        .for('update')
      return row?.projectId ?? null
    }
    if (session.entity_type === 'variation_order') {
      const [row] = await transaction
        .select({ projectId: variationOrders.project_id })
        .from(variationOrders)
        .where(
          and(
            eq(variationOrders.id, session.entity_id),
            eq(variationOrders.tenant_id, session.tenant_id)
          )
        )
        .limit(1)
        .for('update')
      return row?.projectId ?? null
    }
    const [row] = await transaction
      .select({ projectId: certificatesOfCompletion.project_id })
      .from(certificatesOfCompletion)
      .where(
        and(
          eq(certificatesOfCompletion.id, session.entity_id),
          eq(certificatesOfCompletion.tenant_id, session.tenant_id)
        )
      )
      .limit(1)
      .for('update')
    return row?.projectId ?? null
  }
}
