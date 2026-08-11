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
  bankStatementAutoMatchRequests,
  bankStatementLineMatchRequests,
  bankStatementLines,
  bankStatements,
  users,
} from '@third-code-erp/database/schema'
import {
  bankStatementAutoMatchCommandSchema,
  bankStatementAutoMatchResultSchema,
  bankStatementLineMatchCommandSchema,
  bankStatementLineMatchResultSchema,
  bankStatementLineUnmatchCommandSchema,
  type BankStatementAutoMatchBody,
  type BankStatementAutoMatchResult,
  type BankStatementLineMatchBody,
  type BankStatementLineMatchCommand,
  type BankStatementLineMatchResult,
  type BankStatementLineUnmatchBody,
  type BankStatementLineUnmatchCommand,
} from '@third-code-erp/shared-types'
import { and, eq, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

type AutoMatchRequest = {
  id: string
  statementId: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
}

type LineMatchRequest = {
  id: string
  lineId: string
  action: 'match' | 'unmatch'
  cashTransactionId: string | null
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
}

function commandHash(command: { statementId: string }): string {
  return createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex')
}

function lineCommandHash(
  action: 'match' | 'unmatch',
  command: BankStatementLineMatchCommand | BankStatementLineUnmatchCommand
): string {
  return createHash('sha256')
    .update(JSON.stringify({ action, ...command }))
    .digest('hex')
}

function validateKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): BankStatementAutoMatchResult {
  const parsed = bankStatementAutoMatchResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Bank statement auto-match idempotency result is invalid'
    )
  }
  return parsed.data
}

function replayLineResult(value: unknown): BankStatementLineMatchResult {
  const parsed = bankStatementLineMatchResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Bank statement line match idempotency result is invalid'
    )
  }
  return parsed.data
}

function mapDatabaseFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('Bank statement not found')) {
    throw new NotFoundException('Bank statement not found')
  }
  if (message.includes('Actor cannot auto-match this bank statement')) {
    throw new ForbiddenException('Actor cannot auto-match this bank statement')
  }
  if (message.includes('Only a draft bank statement can be matched')) {
    throw new ConflictException(message)
  }
  if (
    message.includes('Bank statement line not found') ||
    message.includes('Bank statement match does not agree with posted cash') ||
    message.includes('Only draft bank statement lines can change')
  ) {
    if (message.includes('Bank statement line not found')) {
      throw new NotFoundException('Bank statement line not found')
    }
    throw new ConflictException(message)
  }
  if (
    message.includes('Actor cannot match this bank statement line') ||
    message.includes('Actor cannot unmatch this bank statement line')
  ) {
    throw new ForbiddenException(message)
  }
  throw error
}

@Injectable()
export class FinanceReconciliationWorkflowService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async autoMatch(
    statementId: string,
    body: BankStatementAutoMatchBody,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<BankStatementAutoMatchResult> {
    const command = bankStatementAutoMatchCommandSchema.parse({
      statementId,
      ...body,
    })
    const idempotencyKey = validateKey(rawIdempotencyKey)
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Bank statement auto-match is not enabled for this tenant; no bank statement was changed.'
      )
    }

    const requestHash = commandHash(command)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      const [statement] = await transaction
        .select({ id: bankStatements.id, status: bankStatements.status })
        .from(bankStatements)
        .where(
          and(
            eq(bankStatements.id, command.statementId),
            eq(bankStatements.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!statement) throw new NotFoundException('Bank statement not found')

      await this.audit.stampActor(transaction, authorizedPrincipal)
      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        command.statementId,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replayResult(request.result)

      try {
        const rows = await transaction.execute(sql`
          select matched_count, remaining_count
          from public.auto_match_bank_statement(
            ${command.statementId}::uuid,
            ${authorizedPrincipal.userId}::uuid
          )
        `)
        const resultRow = rows[0] as
          | { matched_count: number; remaining_count: number }
          | undefined
        if (!resultRow) {
          throw new InternalServerErrorException(
            'Bank statement auto-match returned no result'
          )
        }
        const result = bankStatementAutoMatchResultSchema.parse({
          statementId: command.statementId,
          tenantId: authorizedPrincipal.tenantId,
          status: 'draft',
          matchedCount: Number(resultRow.matched_count),
          remainingCount: Number(resultRow.remaining_count),
        })
        await this.completeRequest(transaction, request.id, result)
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'bank_statement',
          entityId: command.statementId,
          action: 'update',
          diff: {
            operation: 'auto_match',
            from_status: statement.status,
            matched_count: result.matchedCount,
            remaining_count: result.remainingCount,
            idempotency_key_hash: requestHash,
          },
        })
        return result
      } catch (error) {
        mapDatabaseFailure(error)
      }
    })
  }

  async matchLine(
    statementId: string,
    lineId: string,
    body: BankStatementLineMatchBody,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<BankStatementLineMatchResult> {
    const command = bankStatementLineMatchCommandSchema.parse({
      statementId,
      lineId,
      ...body,
    })
    return this.runLineMatch(
      'match',
      command,
      principal,
      validateKey(rawIdempotencyKey),
      lineCommandHash('match', command)
    )
  }

  async unmatchLine(
    statementId: string,
    lineId: string,
    body: BankStatementLineUnmatchBody,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<BankStatementLineMatchResult> {
    const command = bankStatementLineUnmatchCommandSchema.parse({
      statementId,
      lineId,
      ...body,
    })
    return this.runLineMatch(
      'unmatch',
      command,
      principal,
      validateKey(rawIdempotencyKey),
      lineCommandHash('unmatch', command)
    )
  }

  private async runLineMatch(
    action: 'match',
    command: BankStatementLineMatchCommand,
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<BankStatementLineMatchResult>
  private async runLineMatch(
    action: 'unmatch',
    command: BankStatementLineUnmatchCommand,
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<BankStatementLineMatchResult>
  private async runLineMatch(
    action: 'match' | 'unmatch',
    command: BankStatementLineMatchCommand | BankStatementLineUnmatchCommand,
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<BankStatementLineMatchResult> {
    this.assertLineMatchEnabled(principal)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      const [statement] = await transaction
        .select({ id: bankStatements.id, status: bankStatements.status })
        .from(bankStatements)
        .where(
          and(
            eq(bankStatements.id, command.statementId),
            eq(bankStatements.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!statement) throw new NotFoundException('Bank statement not found')

      const [line] = await transaction
        .select({
          id: bankStatementLines.id,
          matchedCashTransactionId:
            bankStatementLines.matched_cash_transaction_id,
        })
        .from(bankStatementLines)
        .where(
          and(
            eq(bankStatementLines.id, command.lineId),
            eq(bankStatementLines.bank_statement_id, command.statementId),
            eq(bankStatementLines.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!line) throw new NotFoundException('Bank statement line not found')

      await this.audit.stampActor(transaction, authorizedPrincipal)
      const request = await this.claimLineRequest(
        transaction,
        authorizedPrincipal,
        action,
        command.lineId,
        'cashTransactionId' in command ? command.cashTransactionId : null,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replayLineResult(request.result)

      try {
        if (action === 'match') {
          if (!('cashTransactionId' in command)) {
            throw new InternalServerErrorException(
              'Bank statement match command is missing its cash transaction'
            )
          }
          await transaction.execute(sql`
            select public.match_bank_statement_line(
              ${command.lineId}::uuid,
              ${command.cashTransactionId}::uuid,
              ${authorizedPrincipal.userId}::uuid
            )
          `)
        } else {
          await transaction.execute(sql`
            select public.unmatch_bank_statement_line(
              ${command.lineId}::uuid,
              ${authorizedPrincipal.userId}::uuid
            )
          `)
        }

        const [updatedLine] = await transaction
          .select({
            matchedCashTransactionId:
              bankStatementLines.matched_cash_transaction_id,
          })
          .from(bankStatementLines)
          .where(
            and(
              eq(bankStatementLines.id, command.lineId),
              eq(bankStatementLines.tenant_id, authorizedPrincipal.tenantId)
            )
          )
          .limit(1)
        const result = bankStatementLineMatchResultSchema.parse(
          action === 'match'
            ? {
                statementId: command.statementId,
                lineId: command.lineId,
                tenantId: authorizedPrincipal.tenantId,
                status: 'matched',
                matchedCashTransactionId:
                  updatedLine?.matchedCashTransactionId,
              }
            : {
                statementId: command.statementId,
                lineId: command.lineId,
                tenantId: authorizedPrincipal.tenantId,
                status: 'unmatched',
                matchedCashTransactionId:
                  updatedLine?.matchedCashTransactionId ?? null,
              }
        )
        await this.completeLineRequest(transaction, request.id, result)
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'bank_statement_line',
          entityId: command.lineId,
          action: 'update',
          diff: {
            operation: action,
            statement_id: command.statementId,
            from_cash_transaction_id: line.matchedCashTransactionId,
            to_cash_transaction_id: result.matchedCashTransactionId,
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

  private assertLineMatchEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Bank statement line matching is not enabled for this tenant; no bank statement line was changed.'
      )
    }
  }

  private async claimRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    statementId: string,
    idempotencyKey: string,
    requestHash: string
  ): Promise<AutoMatchRequest> {
    await transaction
      .insert(bankStatementAutoMatchRequests)
      .values({
        tenant_id: principal.tenantId,
        bank_statement_id: statementId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          bankStatementAutoMatchRequests.tenant_id,
          bankStatementAutoMatchRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: bankStatementAutoMatchRequests.id,
        statementId: bankStatementAutoMatchRequests.bank_statement_id,
        requestHash: bankStatementAutoMatchRequests.request_hash,
        state: bankStatementAutoMatchRequests.state,
        result: bankStatementAutoMatchRequests.result,
      })
      .from(bankStatementAutoMatchRequests)
      .where(
        and(
          eq(bankStatementAutoMatchRequests.tenant_id, principal.tenantId),
          eq(bankStatementAutoMatchRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Bank statement auto-match idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash || request.statementId !== statementId) {
      throw new ConflictException(
        'Idempotency key was already used with a different bank statement auto-match command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Bank statement auto-match idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: BankStatementAutoMatchResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(bankStatementAutoMatchRequests)
      .set({ state: 'succeeded', result, completed_at: new Date() })
      .where(
        and(
          eq(bankStatementAutoMatchRequests.id, requestId),
          eq(bankStatementAutoMatchRequests.state, 'processing')
        )
      )
      .returning({ id: bankStatementAutoMatchRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Bank statement auto-match idempotency record changed before completion'
      )
    }
  }

  private async claimLineRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    action: 'match' | 'unmatch',
    lineId: string,
    cashTransactionId: string | null,
    idempotencyKey: string,
    requestHash: string
  ): Promise<LineMatchRequest> {
    await transaction
      .insert(bankStatementLineMatchRequests)
      .values({
        tenant_id: principal.tenantId,
        bank_statement_line_id: lineId,
        action,
        cash_transaction_id: cashTransactionId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          bankStatementLineMatchRequests.tenant_id,
          bankStatementLineMatchRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: bankStatementLineMatchRequests.id,
        lineId: bankStatementLineMatchRequests.bank_statement_line_id,
        action: bankStatementLineMatchRequests.action,
        cashTransactionId: bankStatementLineMatchRequests.cash_transaction_id,
        requestHash: bankStatementLineMatchRequests.request_hash,
        state: bankStatementLineMatchRequests.state,
        result: bankStatementLineMatchRequests.result,
      })
      .from(bankStatementLineMatchRequests)
      .where(
        and(
          eq(bankStatementLineMatchRequests.tenant_id, principal.tenantId),
          eq(bankStatementLineMatchRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Bank statement line match idempotency record was not created'
      )
    }
    if (
      request.requestHash !== requestHash ||
      request.lineId !== lineId ||
      request.action !== action ||
      request.cashTransactionId !== cashTransactionId
    ) {
      throw new ConflictException(
        'Idempotency key was already used with a different bank statement line match command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Bank statement line match idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeLineRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: BankStatementLineMatchResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(bankStatementLineMatchRequests)
      .set({ state: 'succeeded', result, completed_at: new Date() })
      .where(
        and(
          eq(bankStatementLineMatchRequests.id, requestId),
          eq(bankStatementLineMatchRequests.state, 'processing')
        )
      )
      .returning({ id: bankStatementLineMatchRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Bank statement line match idempotency record changed before completion'
      )
    }
  }
}
