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
  stockReceiptWorkflowRequests,
  stockReceipts,
  users,
} from '@third-code-erp/database/schema'
import {
  stockReceiptPostingResultSchema,
  stockReceiptReversalResultSchema,
  type StockReceiptPostingResult,
  type StockReceiptReversalResult,
} from '@third-code-erp/shared-types'
import { and, eq, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import type {
  StockReceiptPostCommand,
  StockReceiptReverseCommand,
} from '@third-code-erp/shared-types'

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

function commandHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function replayPostingResult(value: unknown): StockReceiptPostingResult {
  const parsed = stockReceiptPostingResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Stock Receipt posting idempotency result is invalid'
    )
  }
  return parsed.data
}

function replayReversalResult(value: unknown): StockReceiptReversalResult {
  const parsed = stockReceiptReversalResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Stock Receipt reversal idempotency result is invalid'
    )
  }
  return parsed.data
}

function validateKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function mapPostFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('Stock Receipt not found')) {
    throw new NotFoundException('Stock Receipt not found')
  }
  if (message.includes('Actor cannot post this Stock Receipt')) {
    throw new ForbiddenException('Actor cannot post this Stock Receipt')
  }
  if (
    message.includes('Only a draft Stock Receipt can be posted') ||
    message.includes('Posting date cannot precede receipt date') ||
    message.includes('Stock Receipt requires an issued Purchase Order') ||
    message.includes('Stock Receipt requires positive-valued lines') ||
    message.includes('Stock Receipt quantity exceeds remaining PO quantity') ||
    message.includes('Inventory and Goods Received Not Invoiced accounts required')
  ) {
    throw new ConflictException(message)
  }
  throw error
}

function mapReverseFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('Stock Receipt not found')) {
    throw new NotFoundException('Stock Receipt not found')
  }
  if (message.includes('Actor cannot reverse this Stock Receipt')) {
    throw new ForbiddenException('Actor cannot reverse this Stock Receipt')
  }
  if (
    message.includes('Stock Receipt reversal reason is required') ||
    message.includes('Only a posted Stock Receipt can be reversed') ||
    message.includes('Reversal date cannot precede receipt date')
  ) {
    throw new ConflictException(message)
  }
  throw error
}

@Injectable()
export class StockReceiptWorkflowService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async post(
    receiptId: string,
    command: StockReceiptPostCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<StockReceiptPostingResult> {
    const idempotencyKey = validateKey(rawIdempotencyKey)
    const enabled = this.config.get<boolean>(
      'ERP_INVENTORY_RECEIPT_POST_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Stock Receipt posting is not enabled for this tenant; no receipt was posted.'
      )
    }

    const requestHash = commandHash({
      action: 'post',
      receiptId,
      command,
    })
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(
        transaction,
        principal
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const [scopedReceipt] = await transaction
        .select({ id: stockReceipts.id })
        .from(stockReceipts)
        .where(
          and(
            eq(stockReceipts.id, receiptId),
            eq(stockReceipts.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
      if (!scopedReceipt) throw new NotFoundException('Stock Receipt not found')
      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        receiptId,
        'post',
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') {
        return replayPostingResult(request.result)
      }

      const [receipt] = await transaction
        .select({ id: stockReceipts.id })
        .from(stockReceipts)
        .where(
          and(
            eq(stockReceipts.id, receiptId),
            eq(stockReceipts.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!receipt) throw new NotFoundException('Stock Receipt not found')

      let rows: Array<{
        stock_receipt_id: string
        receipt_number: string
        journal_entry_id: string
        journal_entry_number: string
      }>
      try {
        rows = await transaction.execute(sql`
          select stock_receipt_id, receipt_number, journal_entry_id,
                 journal_entry_number
          from public.post_stock_receipt(
            ${receipt.id}::uuid,
            ${authorizedPrincipal.userId}::uuid,
            ${command.postingDate}::date
          )
        `)
      } catch (error) {
        mapPostFailure(error)
      }
      const posted = rows[0]
      if (!posted) {
        throw new InternalServerErrorException(
          'Stock Receipt posting returned no result'
        )
      }
      const result = stockReceiptPostingResultSchema.parse({
        stockReceiptId: posted.stock_receipt_id,
        tenantId: authorizedPrincipal.tenantId,
        status: 'posted',
        receiptNumber: posted.receipt_number,
        journalEntryId: posted.journal_entry_id,
        journalEntryNumber: posted.journal_entry_number,
      })
      await this.completeRequest(transaction, request.id, result)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'stock_receipt',
        entityId: receipt.id,
        action: 'status_change',
        diff: {
          from: 'draft',
          to: 'posted',
          receipt_number: posted.receipt_number,
          journal_entry_id: posted.journal_entry_id,
          idempotency_key_hash: requestHash,
        },
      })
      return result
    })
  }

  async reverse(
    receiptId: string,
    command: StockReceiptReverseCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<StockReceiptReversalResult> {
    const idempotencyKey = validateKey(rawIdempotencyKey)
    const enabled = this.config.get<boolean>(
      'ERP_INVENTORY_RECEIPT_REVERSE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_INVENTORY_RECEIPT_REVERSE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Stock Receipt reversal is not enabled for this tenant; no receipt was reversed.'
      )
    }

    const requestHash = commandHash({
      action: 'reverse',
      receiptId,
      command,
    })
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(
        transaction,
        principal
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const [scopedReceipt] = await transaction
        .select({ id: stockReceipts.id })
        .from(stockReceipts)
        .where(
          and(
            eq(stockReceipts.id, receiptId),
            eq(stockReceipts.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
      if (!scopedReceipt) throw new NotFoundException('Stock Receipt not found')
      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        receiptId,
        'reverse',
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') {
        return replayReversalResult(request.result)
      }

      const [receipt] = await transaction
        .select({ id: stockReceipts.id })
        .from(stockReceipts)
        .where(
          and(
            eq(stockReceipts.id, receiptId),
            eq(stockReceipts.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!receipt) throw new NotFoundException('Stock Receipt not found')

      let rows: Array<{
        stock_receipt_id: string
        reversal_journal_entry_id: string
        reversal_journal_entry_number: string
      }>
      try {
        rows = await transaction.execute(sql`
          select stock_receipt_id, reversal_journal_entry_id,
                 reversal_journal_entry_number
          from public.reverse_stock_receipt(
            ${receipt.id}::uuid,
            ${authorizedPrincipal.userId}::uuid,
            ${command.reason},
            ${command.postingDate}::date
          )
        `)
      } catch (error) {
        mapReverseFailure(error)
      }
      const reversed = rows[0]
      if (!reversed) {
        throw new InternalServerErrorException(
          'Stock Receipt reversal returned no result'
        )
      }
      const result = stockReceiptReversalResultSchema.parse({
        stockReceiptId: reversed.stock_receipt_id,
        tenantId: authorizedPrincipal.tenantId,
        status: 'reversed',
        reversalJournalEntryId: reversed.reversal_journal_entry_id,
        reversalJournalEntryNumber: reversed.reversal_journal_entry_number,
      })
      await this.completeRequest(transaction, request.id, result)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'stock_receipt',
        entityId: receipt.id,
        action: 'status_change',
        diff: {
          from: 'posted',
          to: 'reversed',
          reversal_journal_entry_id: reversed.reversal_journal_entry_id,
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
    if (
      !membership ||
      !role ||
      !roleHasCapability(role, 'inventory.post_receipt')
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
    receiptId: string,
    action: 'post' | 'reverse',
    idempotencyKey: string,
    requestHash: string
  ) {
    await transaction
      .insert(stockReceiptWorkflowRequests)
      .values({
        tenant_id: principal.tenantId,
        stock_receipt_id: receiptId,
        action,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          stockReceiptWorkflowRequests.tenant_id,
          stockReceiptWorkflowRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: stockReceiptWorkflowRequests.id,
        requestHash: stockReceiptWorkflowRequests.request_hash,
        action: stockReceiptWorkflowRequests.action,
        state: stockReceiptWorkflowRequests.state,
        result: stockReceiptWorkflowRequests.result,
      })
      .from(stockReceiptWorkflowRequests)
      .where(
        and(
          eq(stockReceiptWorkflowRequests.tenant_id, principal.tenantId),
          eq(stockReceiptWorkflowRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Stock Receipt workflow idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash || request.action !== action) {
      throw new ConflictException(
        'Idempotency key was already used with a different Stock Receipt workflow command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Stock Receipt workflow idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: StockReceiptPostingResult | StockReceiptReversalResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(stockReceiptWorkflowRequests)
      .set({
        state: 'succeeded',
        result,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(stockReceiptWorkflowRequests.id, requestId),
          eq(stockReceiptWorkflowRequests.state, 'processing')
        )
      )
      .returning({ id: stockReceiptWorkflowRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Stock Receipt workflow idempotency record changed before completion'
      )
    }
  }
}
