import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
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
  bankStatementImportRequests,
  bankStatementLines,
  bankStatementReconcileRequests,
  bankStatementVoidRequests,
  bankStatements,
  cashAccounts,
  users,
} from '@third-code-erp/database/schema'
import {
  bankStatementAutoMatchCommandSchema,
  bankStatementAutoMatchResultSchema,
  bankStatementLineMatchCommandSchema,
  bankStatementLineMatchResultSchema,
  bankStatementLineUnmatchCommandSchema,
  bankStatementReconcileCommandSchema,
  bankStatementReconcileResultSchema,
  bankStatementVoidCommandSchema,
  bankStatementVoidResultSchema,
  bankStatementImportCommandSchema,
  bankStatementImportResultSchema,
  parseBankStatementCsv,
  type BankStatementAutoMatchBody,
  type BankStatementAutoMatchResult,
  type BankStatementLineMatchBody,
  type BankStatementLineMatchCommand,
  type BankStatementLineMatchResult,
  type BankStatementLineUnmatchBody,
  type BankStatementLineUnmatchCommand,
  type BankStatementReconcileBody,
  type BankStatementReconcileResult,
  type BankStatementVoidBody,
  type BankStatementVoidResult,
  type BankStatementImportCommand,
  type BankStatementImportBody,
  type BankStatementImportResult,
  type ParsedBankStatementLine,
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
import {
  BankStatementImportStorageError,
  BankStatementImportStorageService,
} from './bank-statement-import.storage'

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

type ReconcileRequest = {
  id: string
  statementId: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
}

type VoidRequest = {
  id: string
  statementId: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
}

type ImportRequest = {
  id: string
  statementId: string | null
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
}

type PreparedImport = {
  sourceSha256: string
  lines: ParsedBankStatementLine[]
}

function commandHash(command: { statementId: string }): string {
  return createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex')
}

function payloadHash(command: unknown): string {
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

function replayReconcileResult(value: unknown): BankStatementReconcileResult {
  const parsed = bankStatementReconcileResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Bank statement reconcile idempotency result is invalid'
    )
  }
  return parsed.data
}

function replayVoidResult(value: unknown): BankStatementVoidResult {
  const parsed = bankStatementVoidResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Bank statement void idempotency result is invalid'
    )
  }
  return parsed.data
}

function replayImportResult(value: unknown): BankStatementImportResult {
  const parsed = bankStatementImportResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Bank statement import idempotency result is invalid'
    )
  }
  return parsed.data
}

function prepareImportBytes(
  command: BankStatementImportCommand,
  sourceBytes: Uint8Array
): PreparedImport {
  const sourceBuffer = Buffer.from(sourceBytes)
  if (sourceBuffer.length === 0 || sourceBuffer.length > 2_000_000) {
    throw new BadRequestException('Source file must be 2 MB or smaller')
  }

  let lines: ParsedBankStatementLine[]
  try {
    lines = parseBankStatementCsv(sourceBuffer.toString('utf8'))
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : 'Could not parse bank statement CSV'
    )
  }

  if (
    lines.some(
      (line) =>
        line.transactionDate < command.statementStart ||
        line.transactionDate > command.statementEnd
    )
  ) {
    throw new BadRequestException(
      'Bank statement line must match its tenant and date range'
    )
  }

  const fingerprints = new Set<string>()
  for (const line of lines) {
    const fingerprint = [
      line.transactionDate,
      line.referenceNumber?.toLowerCase() ?? '',
      line.amountCents,
      line.description.trim().toLowerCase(),
    ].join('|')
    if (fingerprints.has(fingerprint)) {
      throw new BadRequestException(
        'That statement reference or an exact duplicate line already exists.'
      )
    }
    fingerprints.add(fingerprint)
  }

  const lineTotal = lines.reduce((sum, line) => sum + line.amountCents, 0)
  const closingBalance = command.openingBalanceCents + lineTotal
  if (
    !Number.isSafeInteger(lineTotal) ||
    !Number.isSafeInteger(closingBalance) ||
    closingBalance !== command.closingBalanceCents
  ) {
    throw new BadRequestException('Bank statement balances do not roll forward')
  }

  return {
    sourceSha256: createHash('sha256').update(sourceBuffer).digest('hex'),
    lines,
  }
}

function mapDatabaseFailure(error: unknown): never {
  const message = databaseErrorMessage(error)
  if (message.includes('Bank statement not found')) {
    throw new NotFoundException('Bank statement not found')
  }
  if (message.includes('Actor cannot auto-match this bank statement')) {
    throw new ForbiddenException('Actor cannot auto-match this bank statement')
  }
  if (message.includes('Actor cannot reconcile this bank statement')) {
    throw new ForbiddenException('Actor cannot reconcile this bank statement')
  }
  if (message.includes('Actor cannot void this bank statement')) {
    throw new ForbiddenException('Actor cannot void this bank statement')
  }
  if (message.includes('Only a draft bank statement can be matched')) {
    throw new ConflictException(message)
  }
  if (
    message.includes('Only a draft bank statement can be reconciled') ||
    message.includes('Bank statement requires at least one line') ||
    message.includes('Bank statement balances do not roll forward') ||
    message.includes('Every bank statement line must be matched') ||
    message.includes('Matched cash evidence changed before reconciliation')
  ) {
    throw new ConflictException(message)
  }
  if (
    message.includes('Only a reconciled bank statement can be voided') ||
    message.includes('Bank statement void reason is required')
  ) {
    throw new ConflictException(message)
  }
  if (
    message.includes('ux_bank_statements_reference') ||
    message.includes('ux_bank_statement_lines_fingerprint') ||
    message.includes('Active bank or e-wallet Cash Account is required')
  ) {
    throw new ConflictException(
      'That statement reference, duplicate line, or Cash Account is invalid'
    )
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
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BankStatementImportStorageService)
    private readonly importStorage: BankStatementImportStorageService
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

  async reconcile(
    statementId: string,
    body: BankStatementReconcileBody,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<BankStatementReconcileResult> {
    const command = bankStatementReconcileCommandSchema.parse({
      statementId,
      ...body,
    })
    return this.runReconcile(
      command,
      principal,
      validateKey(rawIdempotencyKey),
      commandHash(command)
    )
  }

  async voidStatement(
    statementId: string,
    body: BankStatementVoidBody,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<BankStatementVoidResult> {
    const command = bankStatementVoidCommandSchema.parse({
      statementId,
      ...body,
    })
    return this.runVoid(
      command,
      principal,
      validateKey(rawIdempotencyKey),
      commandHash(command)
    )
  }

  async importStatement(
    body: BankStatementImportBody,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<BankStatementImportResult> {
    const command = bankStatementImportCommandSchema.parse(body)
    return this.runImport(
      command,
      principal,
      validateKey(rawIdempotencyKey),
      payloadHash(command)
    )
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

  private async runReconcile(
    command: { statementId: string },
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<BankStatementReconcileResult> {
    this.assertReconcileEnabled(principal)
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
      const request = await this.claimReconcileRequest(
        transaction,
        authorizedPrincipal,
        command.statementId,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') {
        return replayReconcileResult(request.result)
      }

      try {
        await transaction.execute(sql`
          select public.reconcile_bank_statement(
            ${command.statementId}::uuid,
            ${authorizedPrincipal.userId}::uuid
          )
        `)
        const [updatedStatement] = await transaction
          .select({
            id: bankStatements.id,
            tenantId: bankStatements.tenant_id,
            status: bankStatements.status,
          })
          .from(bankStatements)
          .where(
            and(
              eq(bankStatements.id, command.statementId),
              eq(bankStatements.tenant_id, authorizedPrincipal.tenantId)
            )
          )
          .limit(1)
        const result = bankStatementReconcileResultSchema.parse({
          statementId: updatedStatement?.id,
          tenantId: updatedStatement?.tenantId,
          status: updatedStatement?.status,
        })
        await this.completeReconcileRequest(transaction, request.id, result)
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'bank_statement',
          entityId: command.statementId,
          action: 'update',
          diff: {
            operation: 'reconcile',
            from_status: statement.status,
            to_status: result.status,
            idempotency_key_hash: requestHash,
          },
        })
        return result
      } catch (error) {
        mapDatabaseFailure(error)
      }
    })
  }

  private async runImport(
    command: BankStatementImportCommand,
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<BankStatementImportResult> {
    this.assertImportEnabled(principal)
    const prepared = await this.prepareImport(command, principal.tenantId)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const request = await this.claimImportRequest(
        transaction,
        authorizedPrincipal,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replayImportResult(request.result)

      const [cashAccount] = await transaction
        .select({
          id: cashAccounts.id,
          currency: cashAccounts.currency,
        })
        .from(cashAccounts)
        .where(
          and(
            eq(cashAccounts.id, command.cashAccountId),
            eq(cashAccounts.tenant_id, authorizedPrincipal.tenantId),
            eq(cashAccounts.is_active, true)
          )
        )
        .limit(1)
        .for('update')
      if (!cashAccount) {
        throw new ConflictException(
          'Active bank or e-wallet Cash Account is required'
        )
      }

      const [statement] = await transaction
        .insert(bankStatements)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          cash_account_id: cashAccount.id,
          reference_number: command.referenceNumber,
          source_file_name: command.sourceFileName,
          source_storage_path: command.sourceStoragePath ?? null,
          source_sha256: prepared.sourceSha256,
          statement_start: command.statementStart,
          statement_end: command.statementEnd,
          currency: cashAccount.currency,
          opening_balance_cents: command.openingBalanceCents,
          closing_balance_cents: command.closingBalanceCents,
          created_by: authorizedPrincipal.userId,
        })
        .returning({ id: bankStatements.id })
      if (!statement) {
        throw new InternalServerErrorException('Bank statement was not created')
      }

      await transaction.insert(bankStatementLines).values(
        prepared.lines.map((line, index) => ({
          tenant_id: authorizedPrincipal.tenantId,
          bank_statement_id: statement.id,
          line_number: index + 1,
          transaction_date: line.transactionDate,
          reference_number: line.referenceNumber,
          description: line.description,
          amount_cents: line.amountCents,
        }))
      )

      const result = bankStatementImportResultSchema.parse({
        statementId: statement.id,
        tenantId: authorizedPrincipal.tenantId,
        status: 'draft',
        lineCount: prepared.lines.length,
        sourceSha256: prepared.sourceSha256,
      })
      await this.completeImportRequest(transaction, request.id, result, statement.id)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'bank_statement',
        entityId: statement.id,
        action: 'create',
        diff: {
          operation: 'import',
          reference_number: command.referenceNumber,
          line_count: prepared.lines.length,
          source_sha256: prepared.sourceSha256,
          source_storage_path: command.sourceStoragePath ?? null,
          idempotency_key_hash: requestHash,
        },
      })
      return result
    })
  }

  private async runVoid(
    command: { statementId: string; reason: string },
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<BankStatementVoidResult> {
    this.assertVoidEnabled(principal)
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
      const request = await this.claimVoidRequest(
        transaction,
        authorizedPrincipal,
        command.statementId,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replayVoidResult(request.result)

      try {
        await transaction.execute(sql`
          select public.void_bank_statement(
            ${command.statementId}::uuid,
            ${authorizedPrincipal.userId}::uuid,
            ${command.reason}::text
          )
        `)
        const [updatedStatement] = await transaction
          .select({
            id: bankStatements.id,
            tenantId: bankStatements.tenant_id,
            status: bankStatements.status,
          })
          .from(bankStatements)
          .where(
            and(
              eq(bankStatements.id, command.statementId),
              eq(bankStatements.tenant_id, authorizedPrincipal.tenantId)
            )
          )
          .limit(1)
        const result = bankStatementVoidResultSchema.parse({
          statementId: updatedStatement?.id,
          tenantId: updatedStatement?.tenantId,
          status: updatedStatement?.status,
        })
        await this.completeVoidRequest(transaction, request.id, result)
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'bank_statement',
          entityId: command.statementId,
          action: 'status_change',
          diff: {
            operation: 'void',
            from_status: statement.status,
            to_status: result.status,
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

  private assertReconcileEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Bank statement reconciliation is not enabled for this tenant; no bank statement was changed.'
      )
    }
  }

  private assertVoidEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_RECONCILIATION_VOID_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_RECONCILIATION_VOID_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Bank statement voiding is not enabled for this tenant; no bank statement was changed.'
      )
    }
  }

  private assertImportEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Bank statement importing is not enabled for this tenant; no bank statement was changed.'
      )
    }
  }

  private async prepareImport(
    command: BankStatementImportCommand,
    tenantId: string
  ): Promise<PreparedImport> {
    if (command.sourceStoragePath) {
      const expectedPrefix = `${tenantId}/bank-statements/`
      if (
        !command.sourceStoragePath.startsWith(expectedPrefix) ||
        command.sourceStoragePath.includes('..')
      ) {
        throw new ForbiddenException(
          'Bank statement source is outside the tenant storage scope'
        )
      }
      let sourceBytes: Uint8Array
      try {
        sourceBytes = await this.importStorage.readCsv(
          command.sourceStoragePath
        )
      } catch (error) {
        if (
          error instanceof BankStatementImportStorageError &&
          error.code === 'object_too_large'
        ) {
          throw new BadRequestException('Source file must be 2 MB or smaller')
        }
        throw new ServiceUnavailableException(
          'Bank statement source object is unavailable; no bank statement was changed.'
        )
      }
      return prepareImportBytes(command, sourceBytes)
    }
    if (!command.sourceBase64) {
      throw new BadRequestException('Provide exactly one import source')
    }
    return prepareImportBytes(
      command,
      Buffer.from(command.sourceBase64, 'base64')
    )
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

  private async claimReconcileRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    statementId: string,
    idempotencyKey: string,
    requestHash: string
  ): Promise<ReconcileRequest> {
    await transaction
      .insert(bankStatementReconcileRequests)
      .values({
        tenant_id: principal.tenantId,
        bank_statement_id: statementId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          bankStatementReconcileRequests.tenant_id,
          bankStatementReconcileRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: bankStatementReconcileRequests.id,
        statementId: bankStatementReconcileRequests.bank_statement_id,
        requestHash: bankStatementReconcileRequests.request_hash,
        state: bankStatementReconcileRequests.state,
        result: bankStatementReconcileRequests.result,
      })
      .from(bankStatementReconcileRequests)
      .where(
        and(
          eq(bankStatementReconcileRequests.tenant_id, principal.tenantId),
          eq(bankStatementReconcileRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Bank statement reconcile idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash || request.statementId !== statementId) {
      throw new ConflictException(
        'Idempotency key was already used with a different bank statement reconcile command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Bank statement reconcile idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeReconcileRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: BankStatementReconcileResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(bankStatementReconcileRequests)
      .set({ state: 'succeeded', result, completed_at: new Date() })
      .where(
        and(
          eq(bankStatementReconcileRequests.id, requestId),
          eq(bankStatementReconcileRequests.state, 'processing')
        )
      )
      .returning({ id: bankStatementReconcileRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Bank statement reconcile idempotency record changed before completion'
      )
    }
  }

  private async claimImportRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<ImportRequest> {
    await transaction
      .insert(bankStatementImportRequests)
      .values({
        tenant_id: principal.tenantId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          bankStatementImportRequests.tenant_id,
          bankStatementImportRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: bankStatementImportRequests.id,
        statementId: bankStatementImportRequests.bank_statement_id,
        requestHash: bankStatementImportRequests.request_hash,
        state: bankStatementImportRequests.state,
        result: bankStatementImportRequests.result,
      })
      .from(bankStatementImportRequests)
      .where(
        and(
          eq(bankStatementImportRequests.tenant_id, principal.tenantId),
          eq(bankStatementImportRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Bank statement import idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different bank statement import command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Bank statement import idempotency record has an unsupported state'
      )
    }
    if (request.state === 'succeeded' && !request.statementId) {
      throw new InternalServerErrorException(
        'Bank statement import idempotency result has no statement'
      )
    }
    return request
  }

  private async completeImportRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: BankStatementImportResult,
    statementId: string
  ): Promise<void> {
    const [completed] = await transaction
      .update(bankStatementImportRequests)
      .set({
        bank_statement_id: statementId,
        state: 'succeeded',
        result,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(bankStatementImportRequests.id, requestId),
          eq(bankStatementImportRequests.state, 'processing')
        )
      )
      .returning({ id: bankStatementImportRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Bank statement import idempotency record changed before completion'
      )
    }
  }

  private async claimVoidRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    statementId: string,
    idempotencyKey: string,
    requestHash: string
  ): Promise<VoidRequest> {
    await transaction
      .insert(bankStatementVoidRequests)
      .values({
        tenant_id: principal.tenantId,
        bank_statement_id: statementId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          bankStatementVoidRequests.tenant_id,
          bankStatementVoidRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: bankStatementVoidRequests.id,
        statementId: bankStatementVoidRequests.bank_statement_id,
        requestHash: bankStatementVoidRequests.request_hash,
        state: bankStatementVoidRequests.state,
        result: bankStatementVoidRequests.result,
      })
      .from(bankStatementVoidRequests)
      .where(
        and(
          eq(bankStatementVoidRequests.tenant_id, principal.tenantId),
          eq(bankStatementVoidRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Bank statement void idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash || request.statementId !== statementId) {
      throw new ConflictException(
        'Idempotency key was already used with a different bank statement void command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Bank statement void idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeVoidRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: BankStatementVoidResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(bankStatementVoidRequests)
      .set({ state: 'succeeded', result, completed_at: new Date() })
      .where(
        and(
          eq(bankStatementVoidRequests.id, requestId),
          eq(bankStatementVoidRequests.state, 'processing')
        )
      )
      .returning({ id: bankStatementVoidRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Bank statement void idempotency record changed before completion'
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
