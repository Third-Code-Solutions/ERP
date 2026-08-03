import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  purchaseOrders,
  vendorConfirmationRequests,
  vendorConfirmationSessions,
} from '@third-code-erp/database/schema'
import {
  vendorConfirmationCommandSchema,
  vendorConfirmationResultSchema,
  type VendorConfirmationBody,
  type VendorConfirmationResult,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import { hashVendorConfirmationToken } from './vendor-confirmation-token'

const TOKEN_PATTERN = /^[0-9a-f]{64}$/i

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

function commandHash(
  tokenHash: string,
  body: VendorConfirmationBody
): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        tokenHash,
        decision: body.decision,
        responderName: body.responderName,
        responderEmail: body.responderEmail ?? null,
        note: body.note ?? null,
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

function stateError(
  session: {
    state: string
    revoked_at: Date | string | null
    expires_at: Date | string
  },
  now: Date
): string | null {
  if (session.revoked_at) return 'Supplier confirmation link revoked.'
  if (new Date(session.expires_at).getTime() <= now.getTime()) {
    return 'Supplier confirmation link expired.'
  }
  if (session.state !== 'pending') {
    return 'Purchase Order already has a supplier response.'
  }
  return null
}

function replayResult(value: unknown): VendorConfirmationResult {
  const parsed = vendorConfirmationResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Supplier confirmation idempotency result is invalid'
    )
  }
  return parsed.data
}

@Injectable()
export class PublicVendorConfirmationService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async confirm(
    rawToken: string,
    body: VendorConfirmationBody,
    rawIdempotencyKey: string
  ): Promise<VendorConfirmationResult> {
    const token = rawToken.trim()
    if (!TOKEN_PATTERN.test(token)) {
      throw new BadRequestException('Invalid supplier confirmation link.')
    }
    const command = vendorConfirmationCommandSchema.parse({ token, ...body })
    const idempotencyKey = validateKey(rawIdempotencyKey)

    if (
      !this.config.get<boolean>(
        'ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_ENABLED',
        false
      )
    ) {
      throw new ServiceUnavailableException(
        'Supplier confirmation is not enabled; no response was recorded.'
      )
    }
    const tenantIds = this.config.get<string[]>(
      'ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_TENANT_IDS',
      []
    )
    if (tenantIds.length === 0) {
      throw new ServiceUnavailableException(
        'Supplier confirmation is not enabled for this tenant; no response was recorded.'
      )
    }

    const tokenHash = hashVendorConfirmationToken(command.token)
    const [session] = await this.database.client
      .select()
      .from(vendorConfirmationSessions)
      .where(eq(vendorConfirmationSessions.token_hash, tokenHash))
      .limit(1)
    if (!session) throw new NotFoundException('Invalid supplier confirmation link.')
    if (!tenantIds.includes(session.tenant_id)) {
      throw new ServiceUnavailableException(
        'Supplier confirmation is not enabled for this tenant; no response was recorded.'
      )
    }

    const requestHash = commandHash(tokenHash, {
      decision: command.decision,
      responderName: command.responderName,
      responderEmail: command.responderEmail,
      note: command.note,
    })
    const [existing] = await this.database.client
      .select({
        requestHash: vendorConfirmationRequests.request_hash,
        state: vendorConfirmationRequests.state,
        result: vendorConfirmationRequests.result,
      })
      .from(vendorConfirmationRequests)
      .where(
        and(
          eq(vendorConfirmationRequests.tenant_id, session.tenant_id),
          eq(vendorConfirmationRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different supplier response'
        )
      }
      if (existing.state === 'succeeded') return replayResult(existing.result)
    }

    const initialStateError = stateError(session, new Date())
    if (initialStateError) throw new ConflictException(initialStateError)

    return this.database.client.transaction((transaction) =>
      this.commit(
        transaction,
        session.id,
        session.tenant_id,
        session.purchase_order_id,
        session.vendor_id,
        tokenHash,
        command,
        idempotencyKey,
        requestHash
      )
    )
  }

  private async commit(
    transaction: DatabaseTransaction,
    sessionId: string,
    tenantId: string,
    purchaseOrderId: string,
    vendorId: string,
    tokenHash: string,
    command: VendorConfirmationBody,
    idempotencyKey: string,
    requestHash: string
  ): Promise<VendorConfirmationResult> {
    const [lockedSession] = await transaction
      .select()
      .from(vendorConfirmationSessions)
      .where(
        and(
          eq(vendorConfirmationSessions.id, sessionId),
          eq(vendorConfirmationSessions.tenant_id, tenantId),
          eq(vendorConfirmationSessions.token_hash, tokenHash)
        )
      )
      .limit(1)
      .for('update')
    if (!lockedSession) {
      throw new NotFoundException('Invalid supplier confirmation link.')
    }
    const lockedStateError = stateError(lockedSession, new Date())
    if (lockedStateError) throw new ConflictException(lockedStateError)

    const [purchaseOrder] = await transaction
      .select({
        id: purchaseOrders.id,
        status: purchaseOrders.status,
        vendorId: purchaseOrders.vendor_id,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.id, purchaseOrderId),
          eq(purchaseOrders.tenant_id, tenantId)
        )
      )
      .limit(1)
      .for('update')
    if (!purchaseOrder) throw new NotFoundException('Purchase Order not found.')
    if (purchaseOrder.vendorId !== vendorId) {
      throw new ConflictException(
        'Supplier confirmation link does not match this Purchase Order.'
      )
    }
    if (purchaseOrder.status !== 'issued') {
      throw new ConflictException(
        'Purchase Order is no longer awaiting supplier confirmation.'
      )
    }

    await transaction
      .insert(vendorConfirmationRequests)
      .values({
        tenant_id: tenantId,
        vendor_confirmation_session_id: sessionId,
        purchase_order_id: purchaseOrderId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
      })
      .onConflictDoNothing({
        target: [
          vendorConfirmationRequests.tenant_id,
          vendorConfirmationRequests.idempotency_key,
        ],
      })

    const [request] = await transaction
      .select({
        id: vendorConfirmationRequests.id,
        requestHash: vendorConfirmationRequests.request_hash,
        state: vendorConfirmationRequests.state,
        result: vendorConfirmationRequests.result,
      })
      .from(vendorConfirmationRequests)
      .where(
        and(
          eq(vendorConfirmationRequests.tenant_id, tenantId),
          eq(vendorConfirmationRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Supplier confirmation idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different supplier response'
      )
    }
    if (request.state === 'succeeded') return replayResult(request.result)
    if (request.state !== 'processing') {
      throw new ConflictException(
        'Supplier confirmation idempotency record has an unsupported state'
      )
    }

    const respondedAt = new Date()
    const [updatedSession] = await transaction
      .update(vendorConfirmationSessions)
      .set({
        state: command.decision,
        responder_name: command.responderName,
        responder_email: command.responderEmail ?? null,
        response_note: command.note ?? null,
        responded_at: respondedAt,
      })
      .where(
        and(
          eq(vendorConfirmationSessions.id, sessionId),
          eq(vendorConfirmationSessions.tenant_id, tenantId),
          eq(vendorConfirmationSessions.state, 'pending')
        )
      )
      .returning({ id: vendorConfirmationSessions.id })
    if (!updatedSession) {
      throw new ConflictException(
        'Supplier confirmation session changed before response was committed'
      )
    }

    const result = vendorConfirmationResultSchema.parse({
      sessionId,
      tenantId,
      purchaseOrderId,
      vendorId,
      decision: command.decision,
      respondedAt: respondedAt.toISOString(),
    })
    const [completedRequest] = await transaction
      .update(vendorConfirmationRequests)
      .set({
        state: 'succeeded',
        result,
        completed_at: respondedAt,
      })
      .where(
        and(
          eq(vendorConfirmationRequests.id, request.id),
          eq(vendorConfirmationRequests.state, 'processing')
        )
      )
      .returning({ id: vendorConfirmationRequests.id })
    if (!completedRequest) {
      throw new InternalServerErrorException(
        'Supplier confirmation idempotency record was not completed'
      )
    }

    await this.audit.writeSemantic(transaction, {
      tenantId,
      actorId: null,
      entityType: 'purchase_order',
      entityId: purchaseOrderId,
      action: 'status_change',
      diff: {
        from: 'pending_supplier_confirmation',
        to: command.decision,
        responder_name: command.responderName,
        responder_email: command.responderEmail ?? null,
        response_note: command.note ?? null,
        mechanism: 'public_vendor_confirmation_core',
        idempotency_key_hash: requestHash,
      },
    })
    return result
  }
}
