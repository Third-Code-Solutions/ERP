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
  bankStatements,
  users,
} from '@third-code-erp/database/schema'
import {
  bankStatementAutoMatchCommandSchema,
  bankStatementAutoMatchResultSchema,
  type BankStatementAutoMatchBody,
  type BankStatementAutoMatchResult,
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

function commandHash(command: { statementId: string }): string {
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

function replayResult(value: unknown): BankStatementAutoMatchResult {
  const parsed = bankStatementAutoMatchResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Bank statement auto-match idempotency result is invalid'
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
}
