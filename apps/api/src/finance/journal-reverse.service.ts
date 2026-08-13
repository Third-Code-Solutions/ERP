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
  journalEntries,
  journalReverseRequests,
  users,
} from '@third-code-erp/database/schema'
import {
  journalReverseCommandSchema,
  journalReverseResultSchema,
  type JournalReverseBody,
  type JournalReverseResult,
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

function validateKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): JournalReverseResult {
  const parsed = journalReverseResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Journal reversal idempotency result is invalid'
    )
  }
  return parsed.data
}

function mapDatabaseFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('Journal entry not found')) {
    throw new NotFoundException('Journal entry not found')
  }
  if (message.includes('Actor cannot reverse this journal entry')) {
    throw new ForbiddenException('Actor cannot reverse this journal entry')
  }
  if (
    message.includes('A reversal reason is required') ||
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
export class JournalReverseService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async reverse(
    journalEntryId: string,
    body: JournalReverseBody,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<JournalReverseResult> {
    const command = journalReverseCommandSchema.parse({
      journalEntryId,
      ...body,
    })
    const idempotencyKey = validateKey(rawIdempotencyKey)
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_JOURNAL_REVERSE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_JOURNAL_REVERSE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Finance journal reversal is not enabled for this tenant; no journal was reversed.'
      )
    }

    const requestHash = commandHash(command)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(
        transaction,
        principal
      )
      await this.ensureJournalVisible(
        transaction,
        command.journalEntryId,
        authorizedPrincipal.tenantId
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)

      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        command.journalEntryId,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') {
        return replayResult(request.result)
      }

      const [entry] = await transaction
        .select({
          id: journalEntries.id,
          tenantId: journalEntries.tenant_id,
        })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.id, command.journalEntryId),
            eq(journalEntries.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!entry) throw new NotFoundException('Journal entry not found')

      let rows: Array<{
        reversal_entry_id: string
        reversal_number: string
      }>
      try {
        rows = await transaction.execute(sql`
          select reversal_entry_id, reversal_number
          from public.reverse_journal_entry(
            ${entry.id}::uuid,
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
          'Journal reversal returned no result'
        )
      }

      const result = journalReverseResultSchema.parse({
        journalEntryId: entry.id,
        tenantId: authorizedPrincipal.tenantId,
        reversalJournalEntryId: reversed.reversal_entry_id,
        reversalNumber: reversed.reversal_number,
      })
      await this.completeRequest(transaction, request.id, result)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'journal_entry',
        entityId: entry.id,
        action: 'status_change',
        diff: {
          from: 'posted',
          to: 'reversed',
          reversal_entry_id: reversed.reversal_entry_id,
          reversal_number: reversed.reversal_number,
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
      !roleHasCapability(role, 'finance.post')
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

  private async ensureJournalVisible(
    transaction: DatabaseTransaction,
    journalEntryId: string,
    tenantId: string
  ): Promise<void> {
    const [entry] = await transaction
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.id, journalEntryId),
          eq(journalEntries.tenant_id, tenantId)
        )
      )
      .limit(1)
      .for('update')
    if (!entry) throw new NotFoundException('Journal entry not found')
  }

  private async claimRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    journalEntryId: string,
    idempotencyKey: string,
    requestHash: string
  ) {
    await transaction
      .insert(journalReverseRequests)
      .values({
        tenant_id: principal.tenantId,
        journal_entry_id: journalEntryId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          journalReverseRequests.tenant_id,
          journalReverseRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: journalReverseRequests.id,
        requestHash: journalReverseRequests.request_hash,
        journalEntryId: journalReverseRequests.journal_entry_id,
        state: journalReverseRequests.state,
        result: journalReverseRequests.result,
      })
      .from(journalReverseRequests)
      .where(
        and(
          eq(journalReverseRequests.tenant_id, principal.tenantId),
          eq(journalReverseRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Journal reversal idempotency record was not created'
      )
    }
    if (
      request.requestHash !== requestHash ||
      request.journalEntryId !== journalEntryId
    ) {
      throw new ConflictException(
        'Idempotency key was already used with a different journal reversal command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Journal reversal idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: JournalReverseResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(journalReverseRequests)
      .set({
        state: 'succeeded',
        result,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(journalReverseRequests.id, requestId),
          eq(journalReverseRequests.state, 'processing')
        )
      )
      .returning({ id: journalReverseRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Journal reversal idempotency record changed before completion'
      )
    }
  }
}
