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
  cashTransactionWorkflowRequests,
  cashTransactions,
  users,
} from '@third-code-erp/database/schema'
import {
  cashTransactionPostCommandSchema,
  cashTransactionPostResultSchema,
  cashTransactionReverseCommandSchema,
  cashTransactionReverseResultSchema,
  type CashTransactionPostBody,
  type CashTransactionPostResult,
  type CashTransactionReverseBody,
  type CashTransactionReverseResult,
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

type CashWorkflowRequest = {
  id: string
  action: 'post' | 'reverse'
  cashTransactionId: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
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

function commandHash(
  action: 'post' | 'reverse',
  cashTransactionId: string,
  command: unknown
): string {
  return createHash('sha256')
    .update(canonicalJson({ action, cashTransactionId, command }))
    .digest('hex')
}

function validateKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayPost(value: unknown): CashTransactionPostResult {
  const parsed = cashTransactionPostResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Cash transaction posting idempotency result is invalid'
    )
  }
  return parsed.data
}

function replayReverse(value: unknown): CashTransactionReverseResult {
  const parsed = cashTransactionReverseResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Cash transaction reversal idempotency result is invalid'
    )
  }
  return parsed.data
}

function mapDatabaseFailure(error: unknown): never {
  const message = databaseErrorMessage(error)
  if (message.includes('Cash transaction not found')) {
    throw new NotFoundException('Cash transaction not found')
  }
  if (
    message.includes('Actor cannot post this cash transaction') ||
    message.includes('Actor cannot reverse this cash transaction')
  ) {
    throw new ForbiddenException(message)
  }
  if (
    message.includes('Only an unposted draft cash transaction can be posted') ||
    message.includes('Only a posted cash transaction can be reversed') ||
    message.includes('Cash transaction already has a reversal') ||
    message.includes('Cash transaction reversal reason is required') ||
    message.includes('Posting date cannot precede cash transaction date') ||
    message.includes('Reversal date cannot precede cash transaction date') ||
    message.includes('Posting date is not in an open fiscal period') ||
    message.includes('Active matching Cash Account is required') ||
    message.includes('Cash allocations must equal transaction amount') ||
    message.includes('Receipt allocations must match open customer invoices') ||
    message.includes('Receipt allocation exceeds open invoice component') ||
    message.includes('Active Accounts Receivable control account is required') ||
    message.includes('Active Retention Receivable control account is required') ||
    message.includes('Disbursement allocations must match open Supplier Bills') ||
    message.includes('Disbursement allocation exceeds open Supplier Bill') ||
    message.includes('Active Accounts Payable control account is required') ||
    message.includes('Only posted journal entries can be reversed') ||
    message.includes('Reversal entries cannot be reversed') ||
    message.includes('Journal entry already has a reversal') ||
    message.includes('A posted journal requires at least two lines') ||
    message.includes('Journal debits and credits must balance above zero')
  ) {
    throw new ConflictException(message)
  }
  throw error
}

@Injectable()
export class CashTransactionWorkflowService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async post(
    cashTransactionId: string,
    body: CashTransactionPostBody,
    principal: ErpPrincipal,
    idempotencyKey: string
  ): Promise<CashTransactionPostResult> {
    const command = cashTransactionPostCommandSchema.parse({
      cashTransactionId,
      ...body,
    })
    const requestHash = commandHash('post', cashTransactionId, command)
    return this.run(
      'post',
      cashTransactionId,
      command,
      principal,
      validateKey(idempotencyKey),
      requestHash
    )
  }

  async reverse(
    cashTransactionId: string,
    body: CashTransactionReverseBody,
    principal: ErpPrincipal,
    idempotencyKey: string
  ): Promise<CashTransactionReverseResult> {
    const command = cashTransactionReverseCommandSchema.parse({
      cashTransactionId,
      ...body,
    })
    const requestHash = commandHash('reverse', cashTransactionId, command)
    return this.run(
      'reverse',
      cashTransactionId,
      command,
      principal,
      validateKey(idempotencyKey),
      requestHash
    )
  }

  private async run(
    action: 'post',
    cashTransactionId: string,
    command: { cashTransactionId: string; postingDate: string },
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<CashTransactionPostResult>
  private async run(
    action: 'reverse',
    cashTransactionId: string,
    command: { cashTransactionId: string; reason: string; postingDate: string },
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<CashTransactionReverseResult>
  private async run(
    action: 'post' | 'reverse',
    cashTransactionId: string,
    command: Record<string, string>,
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<CashTransactionPostResult | CashTransactionReverseResult> {
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cash transaction workflow is not enabled for this tenant; no cash transaction was changed.'
      )
    }
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      const [cashTransaction] = await transaction
        .select({ id: cashTransactions.id })
        .from(cashTransactions)
        .where(
          and(
            eq(cashTransactions.id, cashTransactionId),
            eq(cashTransactions.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!cashTransaction) throw new NotFoundException('Cash transaction not found')

      await this.audit.stampActor(transaction, authorizedPrincipal)
      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        action,
        cashTransactionId,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') {
        return action === 'post'
          ? replayPost(request.result)
          : replayReverse(request.result)
      }

      try {
        if (action === 'post') {
          const rows = await transaction.execute(sql`
            select journal_entry_id, journal_entry_number, cash_transaction_number
            from public.post_cash_transaction(
              ${cashTransactionId}::uuid,
              ${authorizedPrincipal.userId}::uuid,
              ${command.postingDate}::date
            )
          `)
          const posted = rows[0] as
            | {
                journal_entry_id: string
                journal_entry_number: string
                cash_transaction_number: string
              }
            | undefined
          if (!posted) throw new InternalServerErrorException('Cash posting returned no result')
          const result = cashTransactionPostResultSchema.parse({
            cashTransactionId,
            tenantId: authorizedPrincipal.tenantId,
            status: 'posted',
            cashTransactionNumber: posted.cash_transaction_number,
            journalEntryId: posted.journal_entry_id,
            journalEntryNumber: posted.journal_entry_number,
          })
          await this.completeRequest(transaction, request.id, result)
          await this.audit.writeSemantic(transaction, {
            tenantId: authorizedPrincipal.tenantId,
            actorId: authorizedPrincipal.userId,
            entityType: 'cash_transaction',
            entityId: cashTransactionId,
            action: 'status_change',
            diff: {
              from: 'draft',
              to: 'posted',
              cash_transaction_number: posted.cash_transaction_number,
              journal_entry_id: posted.journal_entry_id,
              idempotency_key_hash: requestHash,
            },
          })
          return result
        }

        const rows = await transaction.execute(sql`
          select reversal_entry_id, reversal_entry_number
          from public.reverse_cash_transaction(
            ${cashTransactionId}::uuid,
            ${authorizedPrincipal.userId}::uuid,
            ${command.reason}::text,
            ${command.postingDate}::date
          )
        `)
        const reversed = rows[0] as
          | { reversal_entry_id: string; reversal_entry_number: string }
          | undefined
        if (!reversed) throw new InternalServerErrorException('Cash reversal returned no result')
        const result = cashTransactionReverseResultSchema.parse({
          cashTransactionId,
          tenantId: authorizedPrincipal.tenantId,
          status: 'reversed',
          reversalJournalEntryId: reversed.reversal_entry_id,
          reversalJournalEntryNumber: reversed.reversal_entry_number,
        })
        await this.completeRequest(transaction, request.id, result)
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'cash_transaction',
          entityId: cashTransactionId,
          action: 'status_change',
          diff: {
            from: 'posted',
            to: 'reversed',
            reversal_journal_entry_id: reversed.reversal_entry_id,
            reversal_journal_entry_number: reversed.reversal_entry_number,
            reason: command.reason,
            idempotency_key_hash: requestHash,
          },
        })
        return result
      } catch (error) {
        mapDatabaseFailure(error)
      }
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
        and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId))
      )
      .limit(1)
      .for('update')
    const role = membership?.role as ErpRole | undefined
    if (!membership || !role || !roleHasCapability(role, 'finance.manage_cash')) {
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
    action: 'post' | 'reverse',
    cashTransactionId: string,
    idempotencyKey: string,
    requestHash: string
  ): Promise<CashWorkflowRequest> {
    await transaction
      .insert(cashTransactionWorkflowRequests)
      .values({
        tenant_id: principal.tenantId,
        cash_transaction_id: cashTransactionId,
        action,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          cashTransactionWorkflowRequests.tenant_id,
          cashTransactionWorkflowRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: cashTransactionWorkflowRequests.id,
        action: cashTransactionWorkflowRequests.action,
        cashTransactionId: cashTransactionWorkflowRequests.cash_transaction_id,
        requestHash: cashTransactionWorkflowRequests.request_hash,
        state: cashTransactionWorkflowRequests.state,
        result: cashTransactionWorkflowRequests.result,
      })
      .from(cashTransactionWorkflowRequests)
      .where(
        and(
          eq(cashTransactionWorkflowRequests.tenant_id, principal.tenantId),
          eq(cashTransactionWorkflowRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Cash transaction workflow idempotency record was not created'
      )
    }
    if (
      request.requestHash !== requestHash ||
      request.action !== action ||
      request.cashTransactionId !== cashTransactionId
    ) {
      throw new ConflictException(
        'Idempotency key was already used with a different cash transaction workflow command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Cash transaction workflow idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: CashTransactionPostResult | CashTransactionReverseResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(cashTransactionWorkflowRequests)
      .set({ state: 'succeeded', result, completed_at: new Date() })
      .where(
        and(
          eq(cashTransactionWorkflowRequests.id, requestId),
          eq(cashTransactionWorkflowRequests.state, 'processing')
        )
      )
      .returning({ id: cashTransactionWorkflowRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Cash transaction workflow idempotency record changed before completion'
      )
    }
  }
}
