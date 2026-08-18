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
  journalPostRequests,
  users,
} from '@third-code-erp/database/schema'
import {
  journalPostCommandSchema,
  journalPostResultSchema,
  type JournalPostResult,
} from '@third-code-erp/shared-types'
import { and, eq, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'
import { databaseErrorMessage } from '../database/database-error'

function commandHash(journalEntryId: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ journalEntryId }))
    .digest('hex')
}

function replayResult(value: unknown): JournalPostResult {
  const parsed = journalPostResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Journal post idempotency result is invalid'
    )
  }
  return parsed.data
}

function mapDatabaseFailure(error: unknown): never {
  const message = databaseErrorMessage(error)
  if (message.includes('Journal entry not found')) {
    throw new NotFoundException('Journal entry not found')
  }
  if (message.includes('Actor cannot post this journal entry')) {
    throw new ForbiddenException('Actor cannot post this journal entry')
  }
  if (
    message.includes('Only draft journal entries can be posted') ||
    message.includes('Posting date is not in an open fiscal period') ||
    message.includes('A posted journal requires at least two lines') ||
    message.includes('Journal debits and credits must balance above zero') ||
    message.includes('Inactive ledger accounts cannot receive postings')
  ) {
    throw new ConflictException(message)
  }
  throw error
}

@Injectable()
export class JournalPostService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async post(
    journalEntryId: string,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<JournalPostResult> {
    const command = journalPostCommandSchema.parse({ journalEntryId })
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Finance journal posting is not enabled for this tenant; no journal was posted.'
      )
    }

    const requestHash = commandHash(command.journalEntryId)
    return this.database.client.transaction(async (transaction) => {
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
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role,
        email: membership.email,
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

      await this.audit.stampActor(transaction, authorizedPrincipal)

      await transaction
        .insert(journalPostRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          journal_entry_id: command.journalEntryId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoNothing({
          target: [
            journalPostRequests.tenant_id,
            journalPostRequests.idempotency_key,
          ],
        })

      const [request] = await transaction
        .select({
          id: journalPostRequests.id,
          requestHash: journalPostRequests.request_hash,
          state: journalPostRequests.state,
          result: journalPostRequests.result,
        })
        .from(journalPostRequests)
        .where(
          and(
            eq(
              journalPostRequests.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(journalPostRequests.idempotency_key, idempotencyKey)
          )
        )
        .limit(1)
        .for('update')

      if (!request) {
        throw new InternalServerErrorException(
          'Journal post idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different journal post command'
        )
      }
      if (request.state === 'succeeded') {
        return replayResult(request.result)
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Journal post idempotency record has an unsupported state'
        )
      }

      let rows: Array<{
        journal_entry_id: string
        posted_number: string
      }>
      try {
        rows = await transaction.execute(sql`
          select journal_entry_id, posted_number
          from public.post_journal_entry(
            ${entry.id}::uuid,
            ${authorizedPrincipal.userId}::uuid
          )
        `)
      } catch (error) {
        mapDatabaseFailure(error)
      }
      const posted = rows[0]
      if (!posted) {
        throw new InternalServerErrorException(
          'Journal posting returned no result'
        )
      }

      const result = journalPostResultSchema.parse({
        journalEntryId: posted.journal_entry_id,
        tenantId: authorizedPrincipal.tenantId,
        postedNumber: posted.posted_number,
      })
      const [completed] = await transaction
        .update(journalPostRequests)
        .set({
          state: 'succeeded',
          result,
          completed_at: new Date(),
        })
        .where(
          and(
            eq(journalPostRequests.id, request.id),
            eq(journalPostRequests.state, 'processing')
          )
        )
        .returning({ id: journalPostRequests.id })
      if (!completed) {
        throw new InternalServerErrorException(
          'Journal post idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'journal_entry',
        entityId: entry.id,
        action: 'status_change',
        diff: {
          from: 'draft',
          to: 'posted',
          posted_number: posted.posted_number,
          idempotency_key_hash: requestHash,
        },
      })

      return result
    })
  }
}
