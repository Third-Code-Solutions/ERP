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
  cashAccounts,
  cashAllocations,
  cashTransactionDraftRequests,
  cashTransactions,
  invoices,
  supplierBills,
  users,
} from '@third-code-erp/database/schema'
import {
  cashTransactionDraftCommandSchema,
  cashTransactionDraftDeleteCommandSchema,
  cashTransactionDraftDeleteResultSchema,
  cashTransactionDraftResultSchema,
  type CashTransactionDraftCommand,
  type CashTransactionDraftDeleteResult,
  type CashTransactionDraftResult,
} from '@third-code-erp/shared-types'
import { and, eq, inArray } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

type DraftRequest = {
  id: string
  action: 'save' | 'delete'
  cashTransactionId: string | null
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

function commandHash(action: 'save' | 'delete', command: unknown): string {
  return createHash('sha256')
    .update(canonicalJson({ action, command }))
    .digest('hex')
}

function validateKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replaySave(value: unknown): CashTransactionDraftResult {
  const parsed = cashTransactionDraftResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Cash draft save idempotency result is invalid'
    )
  }
  return parsed.data
}

function replayDelete(value: unknown): CashTransactionDraftDeleteResult {
  const parsed = cashTransactionDraftDeleteResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Cash draft deletion idempotency result is invalid'
    )
  }
  return parsed.data
}

function mapDatabaseFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('Active matching Cash Account is required')) {
    throw new ConflictException(message)
  }
  if (message.includes('Receipt allocations must match open customer invoices')) {
    throw new ConflictException(message)
  }
  if (message.includes('Disbursement allocations must match open Supplier Bills')) {
    throw new ConflictException(message)
  }
  if (
    message.includes('ux_cash_transactions_reference') ||
    message.includes('duplicate key value')
  ) {
    throw new ConflictException(
      'That reference already exists for this Cash Account and direction.'
    )
  }
  throw error
}

@Injectable()
export class CashDraftService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async save(
    body: CashTransactionDraftCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<CashTransactionDraftResult> {
    const command = cashTransactionDraftCommandSchema.parse(body)
    const idempotencyKey = validateKey(rawIdempotencyKey)
    this.assertEnabled(principal)
    const requestHash = commandHash('save', command)

    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        'save',
        command.transactionId ?? null,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replaySave(request.result)

      try {
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
          throw new ConflictException('Active matching Cash Account is required')
        }

        const targetIds = [
          ...new Set(command.allocations.map((allocation) => allocation.targetId)),
        ]
        if (command.direction === 'receipt') {
          const targets = await transaction
            .select({ id: invoices.id })
            .from(invoices)
            .where(
              and(
                eq(invoices.tenant_id, authorizedPrincipal.tenantId),
                eq(invoices.account_id, command.counterpartyId),
                inArray(invoices.status, [
                  'issued',
                  'overdue',
                  'partial_payment',
                ]),
                inArray(invoices.id, targetIds)
              )
            )
            .for('update')
          if (targets.length !== targetIds.length) {
            throw new ConflictException(
              'Receipt allocations must match open customer invoices'
            )
          }
        } else {
          const targets = await transaction
            .select({ id: supplierBills.id })
            .from(supplierBills)
            .where(
              and(
                eq(supplierBills.tenant_id, authorizedPrincipal.tenantId),
                eq(supplierBills.vendor_id, command.counterpartyId),
                eq(supplierBills.status, 'posted'),
                inArray(supplierBills.id, targetIds)
              )
            )
            .for('update')
          if (targets.length !== targetIds.length) {
            throw new ConflictException(
              'Disbursement allocations must match open Supplier Bills'
            )
          }
        }

        const amountCents = command.allocations.reduce(
          (sum, allocation) => sum + allocation.amountCents,
          0
        )
        let savedId: string
        let auditAction: 'create' | 'update'
        let previousStatus: string | null = null

        if (command.transactionId) {
          const [draft] = await transaction
            .select({ id: cashTransactions.id, status: cashTransactions.status })
            .from(cashTransactions)
            .where(
              and(
                eq(cashTransactions.id, command.transactionId),
                eq(cashTransactions.tenant_id, authorizedPrincipal.tenantId),
                eq(cashTransactions.status, 'draft')
              )
            )
            .limit(1)
            .for('update')
          if (!draft) throw new NotFoundException('Editable cash draft not found')

          await transaction
            .delete(cashAllocations)
            .where(
              and(
                eq(cashAllocations.cash_transaction_id, draft.id),
                eq(cashAllocations.tenant_id, authorizedPrincipal.tenantId)
              )
            )
          const [updated] = await transaction
            .update(cashTransactions)
            .set({
              cash_account_id: cashAccount.id,
              direction: command.direction,
              business_account_id:
                command.direction === 'receipt' ? command.counterpartyId : null,
              vendor_id:
                command.direction === 'disbursement'
                  ? command.counterpartyId
                  : null,
              reference_number: command.referenceNumber,
              transaction_date: command.transactionDate,
              currency: cashAccount.currency,
              amount_cents: amountCents,
              notes: command.notes || null,
              updated_at: new Date(),
            })
            .where(
              and(
                eq(cashTransactions.id, draft.id),
                eq(cashTransactions.tenant_id, authorizedPrincipal.tenantId),
                eq(cashTransactions.status, 'draft')
              )
            )
            .returning({ id: cashTransactions.id })
          if (!updated) throw new NotFoundException('Cash draft was not updated')
          savedId = updated.id
          auditAction = 'update'
          previousStatus = draft.status
        } else {
          const [created] = await transaction
            .insert(cashTransactions)
            .values({
              tenant_id: authorizedPrincipal.tenantId,
              cash_account_id: cashAccount.id,
              direction: command.direction,
              business_account_id:
                command.direction === 'receipt' ? command.counterpartyId : null,
              vendor_id:
                command.direction === 'disbursement'
                  ? command.counterpartyId
                  : null,
              reference_number: command.referenceNumber,
              transaction_date: command.transactionDate,
              currency: cashAccount.currency,
              amount_cents: amountCents,
              notes: command.notes || null,
              created_by: authorizedPrincipal.userId,
            })
            .returning({ id: cashTransactions.id })
          if (!created) throw new InternalServerErrorException('Cash draft was not created')
          savedId = created.id
          auditAction = 'create'
          await transaction
            .update(cashTransactionDraftRequests)
            .set({ cash_transaction_id: savedId })
            .where(eq(cashTransactionDraftRequests.id, request.id))
        }

        await transaction.insert(cashAllocations).values(
          command.allocations.map((allocation, index) => ({
            tenant_id: authorizedPrincipal.tenantId,
            cash_transaction_id: savedId,
            allocation_type: allocation.allocationType,
            invoice_id:
              allocation.allocationType === 'supplier_bill'
                ? null
                : allocation.targetId,
            supplier_bill_id:
              allocation.allocationType === 'supplier_bill'
                ? allocation.targetId
                : null,
            line_number: index + 1,
            description: allocation.description || null,
            amount_cents: allocation.amountCents,
          }))
        )

        const result = cashTransactionDraftResultSchema.parse({
          cashTransactionId: savedId,
          tenantId: authorizedPrincipal.tenantId,
          status: 'draft',
        })
        await this.completeRequest(transaction, request.id, result)
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'cash_transaction',
          entityId: savedId,
          action: auditAction,
          diff: {
            status: previousStatus,
            to: 'draft',
            direction: command.direction,
            amount_cents: amountCents,
            allocation_count: command.allocations.length,
            idempotency_key_hash: requestHash,
          },
        })
        return result
      } catch (error) {
        mapDatabaseFailure(error)
      }
    })
  }

  async delete(
    cashTransactionId: string,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<CashTransactionDraftDeleteResult> {
    const command = cashTransactionDraftDeleteCommandSchema.parse({
      cashTransactionId,
    })
    const idempotencyKey = validateKey(rawIdempotencyKey)
    this.assertEnabled(principal)
    const requestHash = commandHash('delete', command)

    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        'delete',
        cashTransactionId,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replayDelete(request.result)

      const [draft] = await transaction
        .select({ id: cashTransactions.id, status: cashTransactions.status })
        .from(cashTransactions)
        .where(
          and(
            eq(cashTransactions.id, cashTransactionId),
            eq(cashTransactions.tenant_id, authorizedPrincipal.tenantId),
            eq(cashTransactions.status, 'draft')
          )
      )
        .limit(1)
        .for('update')
      if (!draft) throw new NotFoundException('Cash draft not found')

      // Remove child allocations while parent is still a draft. The database
      // guard permits this explicit delete; relying on FK cascade would run
      // the child guard after the parent disappears and reject the command.
      await transaction
        .delete(cashAllocations)
        .where(
          and(
            eq(cashAllocations.cash_transaction_id, draft.id),
            eq(cashAllocations.tenant_id, authorizedPrincipal.tenantId)
          )
        )

      const [deleted] = await transaction
        .delete(cashTransactions)
        .where(
          and(
            eq(cashTransactions.id, draft.id),
            eq(cashTransactions.tenant_id, authorizedPrincipal.tenantId),
            eq(cashTransactions.status, 'draft')
          )
        )
        .returning({ id: cashTransactions.id })
      if (!deleted) throw new NotFoundException('Cash draft not found')

      const result = cashTransactionDraftDeleteResultSchema.parse({
        cashTransactionId: deleted.id,
        tenantId: authorizedPrincipal.tenantId,
        status: 'deleted',
      })
      await this.completeRequest(transaction, request.id, result)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'cash_transaction',
        entityId: deleted.id,
        action: 'delete',
        diff: {
          from: 'draft',
          to: 'deleted',
          idempotency_key_hash: requestHash,
        },
      })
      return result
    })
  }

  private assertEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cash draft workflow is not enabled for this tenant; no cash draft was changed.'
      )
    }
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
    action: 'save' | 'delete',
    cashTransactionId: string | null,
    idempotencyKey: string,
    requestHash: string
  ): Promise<DraftRequest> {
    await transaction
      .insert(cashTransactionDraftRequests)
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
          cashTransactionDraftRequests.tenant_id,
          cashTransactionDraftRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: cashTransactionDraftRequests.id,
        action: cashTransactionDraftRequests.action,
        cashTransactionId: cashTransactionDraftRequests.cash_transaction_id,
        requestHash: cashTransactionDraftRequests.request_hash,
        state: cashTransactionDraftRequests.state,
        result: cashTransactionDraftRequests.result,
      })
      .from(cashTransactionDraftRequests)
      .where(
        and(
          eq(cashTransactionDraftRequests.tenant_id, principal.tenantId),
          eq(cashTransactionDraftRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Cash draft idempotency record was not created'
      )
    }
    if (
      request.requestHash !== requestHash ||
      request.action !== action ||
      (cashTransactionId !== null &&
        request.cashTransactionId !== cashTransactionId)
    ) {
      throw new ConflictException(
        'Idempotency key was already used with a different cash draft command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Cash draft idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: CashTransactionDraftResult | CashTransactionDraftDeleteResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(cashTransactionDraftRequests)
      .set({ state: 'succeeded', result, completed_at: new Date() })
      .where(
        and(
          eq(cashTransactionDraftRequests.id, requestId),
          eq(cashTransactionDraftRequests.state, 'processing')
        )
      )
      .returning({ id: cashTransactionDraftRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Cash draft idempotency record changed before completion'
      )
    }
  }
}
