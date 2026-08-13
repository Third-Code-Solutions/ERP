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
  stockMovementWorkflowRequests,
  stockMovements,
  users,
} from '@third-code-erp/database/schema'
import {
  stockMovementPostingResultSchema,
  stockMovementPostCommandSchema,
  stockMovementReversalResultSchema,
  stockMovementReverseCommandSchema,
  type StockMovementPostCommand,
  type StockMovementPostingResult,
  type StockMovementReversalResult,
  type StockMovementReverseCommand,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import { sql } from 'drizzle-orm'

type WorkflowRequest = {
  id: string
  action: 'post' | 'reverse'
  stockMovementId: string
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
  stockMovementId: string,
  command: unknown
): string {
  return createHash('sha256')
    .update(canonicalJson({ action, stockMovementId, command }))
    .digest('hex')
}

function validateKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayPostingResult(value: unknown): StockMovementPostingResult {
  const parsed = stockMovementPostingResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Stock Movement posting idempotency result is invalid'
    )
  }
  return parsed.data
}

function replayReversalResult(value: unknown): StockMovementReversalResult {
  const parsed = stockMovementReversalResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Stock Movement reversal idempotency result is invalid'
    )
  }
  return parsed.data
}

function mapDatabaseFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('Stock Movement not found')) {
    throw new NotFoundException('Stock Movement not found')
  }
  if (
    message.includes('Actor cannot post this Stock Movement') ||
    message.includes('Actor cannot reverse this Stock Movement')
  ) {
    throw new ForbiddenException(message)
  }
  if (
    message.includes('Only a draft Stock Movement can be posted') ||
    message.includes('Only a posted Stock Movement can be reversed') ||
    message.includes('Stock Movement requires at least one line') ||
    message.includes('Movement date is not in an open fiscal period') ||
    message.includes('Stock Movement quantity exceeds available stock') ||
    message.includes('Stock Movement value must be positive') ||
    message.includes('Inventory account required for Stock Movement') ||
    message.includes('Inventory Consumption account required') ||
    message.includes('Inventory Adjustment Gain account required') ||
    message.includes('Inventory Adjustment Loss account required') ||
    message.includes('Stock Movement reversal reason is required') ||
    message.includes('Reversal date cannot precede movement date') ||
    message.includes('Reversal date is not in an open fiscal period') ||
    message.includes('Stock Movement reversal exceeds available stock')
  ) {
    throw new ConflictException(message)
  }
  throw error
}

@Injectable()
export class InventoryStockMovementWorkflowService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async post(
    stockMovementId: string,
    command: StockMovementPostCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<StockMovementPostingResult> {
    const parsed = stockMovementPostCommandSchema.parse(command)
    return this.run(
      'post',
      stockMovementId,
      parsed,
      principal,
      validateKey(rawIdempotencyKey),
      commandHash('post', stockMovementId, parsed)
    ) as Promise<StockMovementPostingResult>
  }

  async reverse(
    stockMovementId: string,
    command: StockMovementReverseCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<StockMovementReversalResult> {
    const parsed = stockMovementReverseCommandSchema.parse(command)
    return this.run(
      'reverse',
      stockMovementId,
      parsed,
      principal,
      validateKey(rawIdempotencyKey),
      commandHash('reverse', stockMovementId, parsed)
    ) as Promise<StockMovementReversalResult>
  }

  private async run(
    action: 'post' | 'reverse',
    stockMovementId: string,
    command: StockMovementPostCommand | StockMovementReverseCommand,
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<StockMovementPostingResult | StockMovementReversalResult> {
    const enabled = this.config.get<boolean>(
      'ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Stock Movement workflow is not enabled for this tenant; no Stock Movement was changed.'
      )
    }

    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      const [movement] = await transaction
        .select({ id: stockMovements.id })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.id, stockMovementId),
            eq(stockMovements.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!movement) throw new NotFoundException('Stock Movement not found')

      await this.audit.stampActor(transaction, authorizedPrincipal)
      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        stockMovementId,
        action,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') {
        return action === 'post'
          ? replayPostingResult(request.result)
          : replayReversalResult(request.result)
      }

      try {
        if (action === 'post') {
          const rows = await transaction.execute(sql`
            select stock_movement_id, movement_number, journal_entry_id,
                   journal_entry_number
            from public.post_stock_movement(
              ${stockMovementId}::uuid,
              ${authorizedPrincipal.userId}::uuid
            )
          `)
          const posted = rows[0] as
            | {
                stock_movement_id: string
                movement_number: string
                journal_entry_id: string | null
                journal_entry_number: string | null
              }
            | undefined
          if (!posted) {
            throw new InternalServerErrorException(
              'Stock Movement posting returned no result'
            )
          }
          const result = stockMovementPostingResultSchema.parse({
            stockMovementId: posted.stock_movement_id,
            tenantId: authorizedPrincipal.tenantId,
            status: 'posted',
            movementNumber: posted.movement_number,
            journalEntryId: posted.journal_entry_id,
            journalEntryNumber: posted.journal_entry_number,
          })
          await this.completeRequest(transaction, request.id, result)
          await this.audit.writeSemantic(transaction, {
            tenantId: authorizedPrincipal.tenantId,
            actorId: authorizedPrincipal.userId,
            entityType: 'stock_movement',
            entityId: stockMovementId,
            action: 'status_change',
            diff: {
              from: 'draft',
              to: 'posted',
              movement_number: posted.movement_number,
              journal_entry_id: posted.journal_entry_id,
              idempotency_key_hash: requestHash,
            },
          })
          return result
        }

        const reverseCommand = command as StockMovementReverseCommand
        const rows = await transaction.execute(sql`
          select stock_movement_id, reversal_journal_entry_id,
                 reversal_journal_entry_number
          from public.reverse_stock_movement(
            ${stockMovementId}::uuid,
            ${authorizedPrincipal.userId}::uuid,
            ${reverseCommand.reason}::text,
            ${reverseCommand.reversalDate}::date
          )
        `)
        const reversed = rows[0] as
          | {
              stock_movement_id: string
              reversal_journal_entry_id: string | null
              reversal_journal_entry_number: string | null
            }
          | undefined
        if (!reversed) {
          throw new InternalServerErrorException(
            'Stock Movement reversal returned no result'
          )
        }
        const result = stockMovementReversalResultSchema.parse({
          stockMovementId: reversed.stock_movement_id,
          tenantId: authorizedPrincipal.tenantId,
          status: 'reversed',
          reversalJournalEntryId: reversed.reversal_journal_entry_id,
          reversalJournalEntryNumber: reversed.reversal_journal_entry_number,
        })
        await this.completeRequest(transaction, request.id, result)
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'stock_movement',
          entityId: stockMovementId,
          action: 'status_change',
          diff: {
            from: 'posted',
            to: 'reversed',
            reversal_journal_entry_id: reversed.reversal_journal_entry_id,
            reason: reverseCommand.reason,
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
    if (
      !membership ||
      !role ||
      !roleHasCapability(role, 'inventory.post_movement')
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
    stockMovementId: string,
    action: 'post' | 'reverse',
    idempotencyKey: string,
    requestHash: string
  ): Promise<WorkflowRequest> {
    await transaction
      .insert(stockMovementWorkflowRequests)
      .values({
        tenant_id: principal.tenantId,
        stock_movement_id: stockMovementId,
        action,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          stockMovementWorkflowRequests.tenant_id,
          stockMovementWorkflowRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: stockMovementWorkflowRequests.id,
        action: stockMovementWorkflowRequests.action,
        stockMovementId: stockMovementWorkflowRequests.stock_movement_id,
        requestHash: stockMovementWorkflowRequests.request_hash,
        state: stockMovementWorkflowRequests.state,
        result: stockMovementWorkflowRequests.result,
      })
      .from(stockMovementWorkflowRequests)
      .where(
        and(
          eq(stockMovementWorkflowRequests.tenant_id, principal.tenantId),
          eq(stockMovementWorkflowRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Stock Movement workflow idempotency record was not created'
      )
    }
    if (
      request.requestHash !== requestHash ||
      request.action !== action ||
      request.stockMovementId !== stockMovementId
    ) {
      throw new ConflictException(
        'Idempotency key was already used with a different Stock Movement workflow command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Stock Movement workflow idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: StockMovementPostingResult | StockMovementReversalResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(stockMovementWorkflowRequests)
      .set({ state: 'succeeded', result, completed_at: new Date() })
      .where(
        and(
          eq(stockMovementWorkflowRequests.id, requestId),
          eq(stockMovementWorkflowRequests.state, 'processing')
        )
      )
      .returning({ id: stockMovementWorkflowRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Stock Movement workflow idempotency record changed before completion'
      )
    }
  }
}
