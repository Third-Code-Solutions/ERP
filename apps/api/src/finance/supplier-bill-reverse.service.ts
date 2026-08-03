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
  supplierBillReverseRequests,
  supplierBills,
  users,
} from '@third-code-erp/database/schema'
import {
  supplierBillReverseCommandSchema,
  supplierBillReverseResultSchema,
  type SupplierBillReverseCommand,
  type SupplierBillReverseResult,
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

function commandHash(
  supplierBillId: string,
  command: SupplierBillReverseCommand
): string {
  return createHash('sha256')
    .update(canonicalJson({ supplierBillId, command }))
    .digest('hex')
}

function validateKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): SupplierBillReverseResult {
  const parsed = supplierBillReverseResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Supplier Bill reversal idempotency result is invalid'
    )
  }
  return parsed.data
}

function mapDatabaseFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('Supplier bill not found')) {
    throw new NotFoundException('Supplier bill not found')
  }
  if (message.includes('Actor cannot reverse this supplier bill')) {
    throw new ForbiddenException('Actor cannot reverse this supplier bill')
  }
  if (
    message.includes('Supplier bill reversal reason is required') ||
    message.includes('Only a posted supplier bill can be reversed') ||
    message.includes('Supplier bill already has a reversal') ||
    message.includes('Reverse allocated Vendor disbursements first') ||
    message.includes('Reversal date cannot precede supplier bill date') ||
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
export class SupplierBillReverseService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async reverse(
    supplierBillId: string,
    body: Omit<SupplierBillReverseCommand, 'supplierBillId'>,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<SupplierBillReverseResult> {
    const command = supplierBillReverseCommandSchema.parse({
      supplierBillId,
      ...body,
    })
    const idempotencyKey = validateKey(rawIdempotencyKey)
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Supplier Bill reversal is not enabled for this tenant; no supplier bill was reversed.'
      )
    }

    const requestHash = commandHash(supplierBillId, command)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(
        transaction,
        principal
      )
      const [bill] = await transaction
        .select({
          id: supplierBills.id,
          purchaseOrderId: supplierBills.purchase_order_id,
          status: supplierBills.status,
        })
        .from(supplierBills)
        .where(
          and(
            eq(supplierBills.id, supplierBillId),
            eq(supplierBills.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!bill) throw new NotFoundException('Supplier bill not found')

      await this.audit.stampActor(transaction, authorizedPrincipal)
      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        supplierBillId,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') {
        return replayResult(request.result)
      }

      let rows: Array<{
        reversal_entry_id: string
        reversal_entry_number: string
      }>
      try {
        rows = await transaction.execute(sql`
          select reversal_entry_id, reversal_entry_number
          from public.reverse_supplier_bill(
            ${bill.id}::uuid,
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
          'Supplier Bill reversal returned no result'
        )
      }

      const result = supplierBillReverseResultSchema.parse({
        supplierBillId: bill.id,
        tenantId: authorizedPrincipal.tenantId,
        status: 'reversed',
        reversalJournalEntryId: reversed.reversal_entry_id,
        reversalJournalEntryNumber: reversed.reversal_entry_number,
      })
      await this.completeRequest(transaction, request.id, result)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'supplier_bill',
        entityId: bill.id,
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
    if (!membership || !role || !roleHasCapability(role, 'finance.post')) {
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
    supplierBillId: string,
    idempotencyKey: string,
    requestHash: string
  ) {
    await transaction
      .insert(supplierBillReverseRequests)
      .values({
        tenant_id: principal.tenantId,
        supplier_bill_id: supplierBillId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          supplierBillReverseRequests.tenant_id,
          supplierBillReverseRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: supplierBillReverseRequests.id,
        requestHash: supplierBillReverseRequests.request_hash,
        supplierBillId: supplierBillReverseRequests.supplier_bill_id,
        state: supplierBillReverseRequests.state,
        result: supplierBillReverseRequests.result,
      })
      .from(supplierBillReverseRequests)
      .where(
        and(
          eq(supplierBillReverseRequests.tenant_id, principal.tenantId),
          eq(supplierBillReverseRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Supplier Bill reversal idempotency record was not created'
      )
    }
    if (
      request.requestHash !== requestHash ||
      request.supplierBillId !== supplierBillId
    ) {
      throw new ConflictException(
        'Idempotency key was already used with a different Supplier Bill reversal command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Supplier Bill reversal idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: SupplierBillReverseResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(supplierBillReverseRequests)
      .set({
        state: 'succeeded',
        result,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(supplierBillReverseRequests.id, requestId),
          eq(supplierBillReverseRequests.state, 'processing')
        )
      )
      .returning({ id: supplierBillReverseRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Supplier Bill reversal idempotency record changed before completion'
      )
    }
  }
}
