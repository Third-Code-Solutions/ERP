import { randomUUID } from 'node:crypto'
import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { vendorConfirmationSessions } from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'
import type { DatabaseTransaction } from '../database/database.service'
import {
  deriveVendorConfirmationToken,
  hashVendorConfirmationToken,
} from './vendor-confirmation-token'

const DEFAULT_SESSION_TTL_HOURS = 24 * 30

export interface MintVendorConfirmationSessionInput {
  transaction: DatabaseTransaction
  tenantId: string
  purchaseOrderId: string
  vendorId: string
  sourceWorkflowRequestId: string
  createdBy: string
}

export interface MintedVendorConfirmationSession {
  sessionId: string
  expiresAt: Date
}

@Injectable()
export class VendorConfirmationSessionMintingService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  async mint(
    input: MintVendorConfirmationSessionInput
  ): Promise<MintedVendorConfirmationSession | null> {
    const enabled = this.config.get<boolean>(
      'ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_ENABLED',
      false
    )
    const tenantIds = this.config.get<string[]>(
      'ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_TENANT_IDS',
      []
    )
    if (!enabled || !tenantIds.includes(input.tenantId)) return null

    const secret = this.config.get<string>(
      'ERP_PUBLIC_VENDOR_CONFIRMATION_TOKEN_SECRET'
    )
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        'Supplier confirmation session minting is not configured; no session was recorded.'
      )
    }

    const ttlHours = this.config.get<number>(
      'ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_TTL_HOURS',
      DEFAULT_SESSION_TTL_HOURS
    )
    if (!Number.isInteger(ttlHours) || ttlHours < 1 || ttlHours > 2_160) {
      throw new ServiceUnavailableException(
        'Supplier confirmation session TTL is invalid; no session was recorded.'
      )
    }

    const existingBySource = await input.transaction
      .select({
        id: vendorConfirmationSessions.id,
        purchaseOrderId: vendorConfirmationSessions.purchase_order_id,
        vendorId: vendorConfirmationSessions.vendor_id,
        expiresAt: vendorConfirmationSessions.expires_at,
      })
      .from(vendorConfirmationSessions)
      .where(
        and(
          eq(vendorConfirmationSessions.tenant_id, input.tenantId),
          eq(
            vendorConfirmationSessions.source_workflow_request_id,
            input.sourceWorkflowRequestId
          )
        )
      )
      .limit(1)
      .for('update')
    if (existingBySource[0]) {
      return this.assertCompatible(existingBySource[0], input)
    }

    const existingPendingForPo = await input.transaction
      .select({
        id: vendorConfirmationSessions.id,
        purchaseOrderId: vendorConfirmationSessions.purchase_order_id,
        vendorId: vendorConfirmationSessions.vendor_id,
        expiresAt: vendorConfirmationSessions.expires_at,
      })
      .from(vendorConfirmationSessions)
      .where(
        and(
          eq(vendorConfirmationSessions.tenant_id, input.tenantId),
          eq(
            vendorConfirmationSessions.purchase_order_id,
            input.purchaseOrderId
          ),
          eq(vendorConfirmationSessions.state, 'pending')
        )
      )
      .limit(1)
      .for('update')
    if (existingPendingForPo[0]) {
      return this.assertCompatible(existingPendingForPo[0], input)
    }

    const sessionId = randomUUID()
    const token = deriveVendorConfirmationToken(
      secret,
      input.tenantId,
      sessionId
    )
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1_000)

    await input.transaction
      .insert(vendorConfirmationSessions)
      .values({
        id: sessionId,
        tenant_id: input.tenantId,
        purchase_order_id: input.purchaseOrderId,
        vendor_id: input.vendorId,
        source_workflow_request_id: input.sourceWorkflowRequestId,
        token_hash: hashVendorConfirmationToken(token),
        expires_at: expiresAt,
        created_by: input.createdBy,
      })
      .onConflictDoNothing({
        target: [
          vendorConfirmationSessions.tenant_id,
          vendorConfirmationSessions.source_workflow_request_id,
        ],
      })

    const [session] = await input.transaction
      .select({
        id: vendorConfirmationSessions.id,
        purchaseOrderId: vendorConfirmationSessions.purchase_order_id,
        vendorId: vendorConfirmationSessions.vendor_id,
        expiresAt: vendorConfirmationSessions.expires_at,
      })
      .from(vendorConfirmationSessions)
      .where(
        and(
          eq(vendorConfirmationSessions.tenant_id, input.tenantId),
          eq(
            vendorConfirmationSessions.source_workflow_request_id,
            input.sourceWorkflowRequestId
          )
        )
      )
      .limit(1)
      .for('update')
    if (!session) {
      throw new InternalServerErrorException(
        'Supplier confirmation session was not created'
      )
    }
    return this.assertCompatible(session, input)
  }

  private assertCompatible(
    session: {
      id: string
      purchaseOrderId: string
      vendorId: string
      expiresAt: Date | string
    },
    input: MintVendorConfirmationSessionInput
  ): MintedVendorConfirmationSession {
    if (
      session.purchaseOrderId !== input.purchaseOrderId ||
      session.vendorId !== input.vendorId
    ) {
      throw new ConflictException(
        'Supplier confirmation session scope does not match the Purchase Order'
      )
    }
    return {
      sessionId: session.id,
      expiresAt: new Date(session.expiresAt),
    }
  }
}
