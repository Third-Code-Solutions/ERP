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
  customerInvoiceReverseRequests,
  invoices,
  users,
} from '@third-code-erp/database/schema'
import {
  customerInvoiceReverseCommandSchema,
  customerInvoiceReverseResultSchema,
  type CustomerInvoiceReverseCommand,
  type CustomerInvoiceReverseResult,
} from '@third-code-erp/shared-types'
import { and, eq, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

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
  invoiceId: string,
  command: CustomerInvoiceReverseCommand
): string {
  return createHash('sha256')
    .update(canonicalJson({ invoiceId, command }))
    .digest('hex')
}

function validateKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): CustomerInvoiceReverseResult {
  const parsed = customerInvoiceReverseResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Customer invoice reversal idempotency result is invalid'
    )
  }
  return parsed.data
}

function mapDatabaseFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('Customer invoice not found')) {
    throw new NotFoundException('Customer invoice not found')
  }
  if (message.includes('Actor cannot reverse this customer invoice')) {
    throw new ForbiddenException('Actor cannot reverse this customer invoice')
  }
  if (
    message.includes('Invoice reversal reason is required') ||
    message.includes('Only a posted invoice can be reversed') ||
    message.includes('Only a posted open invoice can be reversed') ||
    message.includes('Customer invoice already has a reversal') ||
    message.includes('Reverse allocated customer receipts first') ||
    message.includes('Reversal date cannot precede invoice date') ||
    message.includes('Reversal date cannot precede journal entry date') ||
    message.includes('Only posted journal entries can be reversed') ||
    message.includes('Reversal entries cannot be reversed') ||
    message.includes('Journal entry already has a reversal') ||
    message.includes('Posting date is not in an open fiscal period') ||
    message.includes('A posted journal requires at least two lines') ||
    message.includes('Journal debits and credits must balance above zero')
  ) {
    throw new ConflictException(message)
  }
  throw error
}

@Injectable()
export class CustomerInvoiceReverseService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async reverse(
    invoiceId: string,
    body: Omit<CustomerInvoiceReverseCommand, 'invoiceId'>,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<CustomerInvoiceReverseResult> {
    const command = customerInvoiceReverseCommandSchema.parse({
      invoiceId,
      ...body,
    })
    const idempotencyKey = validateKey(rawIdempotencyKey)
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Customer invoice reversal is not enabled for this tenant; no customer invoice was reversed.'
      )
    }

    const requestHash = commandHash(invoiceId, command)
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

      let rows: Array<{
        reversal_entry_id: string
        reversal_entry_number: string
      }>
      try {
        rows = await transaction.execute(sql`
          select reversal_entry_id, reversal_entry_number
          from public.reverse_customer_invoice(
            ${invoice.id}::uuid,
            ${authorizedPrincipal.userId}::uuid,
            ${command.reason}::text,
            ${command.postingDate}::date
          )
        `)
      } catch (error) {
        mapDatabaseFailure(error)
      }
      const reversed = rows[0]
      if (!reversed) {
        throw new InternalServerErrorException(
          'Customer invoice reversal returned no result'
        )
      }

      const result = customerInvoiceReverseResultSchema.parse({
        invoiceId: invoice.id,
        tenantId: authorizedPrincipal.tenantId,
        status: 'cancelled',
        reversalJournalEntryId: reversed.reversal_entry_id,
        reversalJournalEntryNumber: reversed.reversal_entry_number,
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
          reversal_journal_entry_id: reversed.reversal_entry_id,
          reversal_journal_entry_number: reversed.reversal_entry_number,
          reason: command.reason,
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
      .insert(customerInvoiceReverseRequests)
      .values({
        tenant_id: principal.tenantId,
        invoice_id: invoiceId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          customerInvoiceReverseRequests.tenant_id,
          customerInvoiceReverseRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: customerInvoiceReverseRequests.id,
        requestHash: customerInvoiceReverseRequests.request_hash,
        invoiceId: customerInvoiceReverseRequests.invoice_id,
        state: customerInvoiceReverseRequests.state,
        result: customerInvoiceReverseRequests.result,
      })
      .from(customerInvoiceReverseRequests)
      .where(
        and(
          eq(customerInvoiceReverseRequests.tenant_id, principal.tenantId),
          eq(customerInvoiceReverseRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Customer invoice reversal idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash || request.invoiceId !== invoiceId) {
      throw new ConflictException(
        'Idempotency key was already used with a different customer invoice reversal command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Customer invoice reversal idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: CustomerInvoiceReverseResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(customerInvoiceReverseRequests)
      .set({ state: 'succeeded', result, completed_at: new Date() })
      .where(
        and(
          eq(customerInvoiceReverseRequests.id, requestId),
          eq(customerInvoiceReverseRequests.state, 'processing')
        )
      )
      .returning({ id: customerInvoiceReverseRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Customer invoice reversal idempotency record changed before completion'
      )
    }
  }
}
