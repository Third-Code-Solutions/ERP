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
  customerInvoiceIssueRequests,
  invoices,
  users,
} from '@third-code-erp/database/schema'
import {
  customerInvoiceIssueCommandSchema,
  customerInvoiceIssueResultSchema,
  type CustomerInvoiceIssueCommand,
  type CustomerInvoiceIssueResult,
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

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
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
  command: CustomerInvoiceIssueCommand
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

function replayResult(value: unknown): CustomerInvoiceIssueResult {
  const parsed = customerInvoiceIssueResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Customer invoice issuance idempotency result is invalid'
    )
  }
  return parsed.data
}

function mapDatabaseFailure(error: unknown): never {
  const message = databaseErrorMessage(error)
  if (message.includes('Customer invoice not found')) {
    throw new NotFoundException('Customer invoice not found')
  }
  if (message.includes('Actor cannot issue this customer invoice')) {
    throw new ForbiddenException('Actor cannot issue this customer invoice')
  }
  if (
    message.includes('Only an unposted draft invoice can be issued') ||
    message.includes('Customer invoice requires a Business Account') ||
    message.includes('Customer invoice Business Account is invalid') ||
    message.includes('Customer invoice amounts do not reconcile') ||
    message.includes('Active Accounts Receivable control account is required') ||
    message.includes('Active Revenue control account is required') ||
    message.includes('Active Retention Receivable control account is required') ||
    message.includes('Active Withholding Tax Receivable control account is required') ||
    message.includes('Active Output VAT control account is required') ||
    message.includes('Posting date is not in an open fiscal period')
  ) {
    throw new ConflictException(message)
  }
  throw error
}

@Injectable()
export class CustomerInvoiceIssueService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async issue(
    invoiceId: string,
    command: CustomerInvoiceIssueCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<CustomerInvoiceIssueResult> {
    const parsedCommand = customerInvoiceIssueCommandSchema.parse(command)
    const idempotencyKey = validateKey(rawIdempotencyKey)
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Customer invoice issuance is not enabled for this tenant; no invoice was issued.'
      )
    }

    const requestHash = commandHash(invoiceId, parsedCommand)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(
        transaction,
        principal
      )
      const [invoice] = await transaction
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoice_number,
          status: invoices.status,
        })
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
      if (request.state === 'succeeded') {
        return replayResult(request.result)
      }

      let rows: Array<{
        journal_entry_id: string
        journal_entry_number: string
      }>
      try {
        rows = await transaction.execute(sql`
          select journal_entry_id, journal_entry_number
          from public.issue_customer_invoice(
            ${invoice.id}::uuid,
            ${authorizedPrincipal.userId}::uuid,
            ${parsedCommand.postingDate}::date
          )
        `)
      } catch (error) {
        mapDatabaseFailure(error)
      }
      const issuedJournal = rows[0]
      if (!issuedJournal) {
        throw new InternalServerErrorException(
          'Customer invoice issuance returned no journal'
        )
      }

      const [issued] = await transaction
        .select({
          invoiceNumber: invoices.invoice_number,
          status: invoices.status,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.id, invoice.id),
            eq(invoices.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
      if (!issued || issued.status !== 'issued') {
        throw new InternalServerErrorException(
          'Customer invoice issuance did not commit an issued invoice'
        )
      }

      const result = customerInvoiceIssueResultSchema.parse({
        invoiceId: invoice.id,
        tenantId: authorizedPrincipal.tenantId,
        status: 'issued',
        invoiceNumber: issued.invoiceNumber,
        journalEntryId: issuedJournal.journal_entry_id,
        journalEntryNumber: issuedJournal.journal_entry_number,
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
          to: 'issued',
          invoice_number: issued.invoiceNumber,
          journal_entry_id: issuedJournal.journal_entry_id,
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
    if (
      !membership ||
      !role ||
      !roleHasCapability(role, 'finance.issue_invoice')
    ) {
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
      .insert(customerInvoiceIssueRequests)
      .values({
        tenant_id: principal.tenantId,
        invoice_id: invoiceId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          customerInvoiceIssueRequests.tenant_id,
          customerInvoiceIssueRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: customerInvoiceIssueRequests.id,
        requestHash: customerInvoiceIssueRequests.request_hash,
        invoiceId: customerInvoiceIssueRequests.invoice_id,
        state: customerInvoiceIssueRequests.state,
        result: customerInvoiceIssueRequests.result,
      })
      .from(customerInvoiceIssueRequests)
      .where(
        and(
          eq(customerInvoiceIssueRequests.tenant_id, principal.tenantId),
          eq(customerInvoiceIssueRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Customer invoice issuance idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash || request.invoiceId !== invoiceId) {
      throw new ConflictException(
        'Idempotency key was already used with a different customer invoice issuance command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Customer invoice issuance idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: CustomerInvoiceIssueResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(customerInvoiceIssueRequests)
      .set({
        state: 'succeeded',
        result,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(customerInvoiceIssueRequests.id, requestId),
          eq(customerInvoiceIssueRequests.state, 'processing')
        )
      )
      .returning({ id: customerInvoiceIssueRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Customer invoice issuance idempotency record changed before completion'
      )
    }
  }
}
