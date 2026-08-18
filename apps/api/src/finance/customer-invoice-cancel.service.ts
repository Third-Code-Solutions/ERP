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
  customerInvoiceCancelRequests,
  invoices,
  users,
} from '@third-code-erp/database/schema'
import {
  customerInvoiceCancelCommandSchema,
  customerInvoiceCancelResultSchema,
  type CustomerInvoiceCancelCommand,
  type CustomerInvoiceCancelResult,
} from '@third-code-erp/shared-types'
import { and, eq, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import { databaseErrorMessage } from '../database/database-error'

function commandHash(command: CustomerInvoiceCancelCommand): string {
  return createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex')
}

function validateKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): CustomerInvoiceCancelResult {
  const parsed = customerInvoiceCancelResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Customer invoice cancellation idempotency result is invalid'
    )
  }
  return parsed.data
}

function mapDatabaseFailure(error: unknown): never {
  const message = databaseErrorMessage(error)
  if (message.includes('Customer invoice not found')) {
    throw new NotFoundException('Customer invoice not found')
  }
  if (message.includes('Actor cannot cancel this customer invoice')) {
    throw new ForbiddenException('Actor cannot cancel this customer invoice')
  }
  if (message.includes('Only an unposted draft invoice can be cancelled')) {
    throw new ConflictException(message)
  }
  throw error
}

@Injectable()
export class CustomerInvoiceCancelService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async cancel(
    invoiceId: string,
    _body: Record<string, never>,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<CustomerInvoiceCancelResult> {
    const command = customerInvoiceCancelCommandSchema.parse({ invoiceId })
    const idempotencyKey = validateKey(rawIdempotencyKey)
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Customer invoice cancellation is not enabled for this tenant; no customer invoice was cancelled.'
      )
    }

    const requestHash = commandHash(command)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      const [invoice] = await transaction
        .select({ id: invoices.id, status: invoices.status })
        .from(invoices)
        .where(
          and(
            eq(invoices.id, invoiceId),
            eq(invoices.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!invoice) throw new NotFoundException('Customer invoice not found')

      await this.audit.stampActor(transaction, authorizedPrincipal)
      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        invoiceId,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replayResult(request.result)

      try {
        await transaction.execute(sql`
          select public.cancel_customer_invoice(
            ${invoice.id}::uuid,
            ${authorizedPrincipal.userId}::uuid
          )
        `)
      } catch (error) {
        mapDatabaseFailure(error)
      }

      const result = customerInvoiceCancelResultSchema.parse({
        invoiceId: invoice.id,
        tenantId: authorizedPrincipal.tenantId,
        status: 'cancelled',
      })
      await this.completeRequest(transaction, request.id, result)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'invoice',
        entityId: invoice.id,
        action: 'status_change',
        diff: {
          from: invoice.status,
          to: 'cancelled',
          idempotency_key_hash: requestHash,
        },
      })
      return result
    })
  }

  private async authorize(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal
  ): Promise<ErpPrincipal> {
    const [membership] = await transaction
      .select({
        tenantId: users.tenant_id,
        role: users.role,
        email: users.email,
      })
      .from(users)
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.tenant_id, principal.tenantId)
        )
      )
      .limit(1)
      .for('update')
    const role = membership?.role as ErpRole | undefined
    if (!membership || !role || !roleHasCapability(role, 'finance.issue_invoice')) {
      throw new ForbiddenException()
    }
    return {
      userId: principal.userId,
      tenantId: membership.tenantId,
      role,
      email: membership.email,
    }
  }

  private async claimRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    invoiceId: string,
    idempotencyKey: string,
    requestHash: string
  ) {
    await transaction
      .insert(customerInvoiceCancelRequests)
      .values({
        tenant_id: principal.tenantId,
        invoice_id: invoiceId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          customerInvoiceCancelRequests.tenant_id,
          customerInvoiceCancelRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: customerInvoiceCancelRequests.id,
        requestHash: customerInvoiceCancelRequests.request_hash,
        invoiceId: customerInvoiceCancelRequests.invoice_id,
        state: customerInvoiceCancelRequests.state,
        result: customerInvoiceCancelRequests.result,
      })
      .from(customerInvoiceCancelRequests)
      .where(
        and(
          eq(customerInvoiceCancelRequests.tenant_id, principal.tenantId),
          eq(customerInvoiceCancelRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Customer invoice cancellation idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash || request.invoiceId !== invoiceId) {
      throw new ConflictException(
        'Idempotency key was already used with a different customer invoice cancellation command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Customer invoice cancellation idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: CustomerInvoiceCancelResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(customerInvoiceCancelRequests)
      .set({ state: 'succeeded', result, completed_at: new Date() })
      .where(
        and(
          eq(customerInvoiceCancelRequests.id, requestId),
          eq(customerInvoiceCancelRequests.state, 'processing')
        )
      )
      .returning({ id: customerInvoiceCancelRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Customer invoice cancellation idempotency record changed before completion'
      )
    }
  }
}
