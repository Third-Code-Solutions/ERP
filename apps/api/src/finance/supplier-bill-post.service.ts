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
  supplierBillPostRequests,
  supplierBills,
  users,
} from '@third-code-erp/database/schema'
import {
  supplierBillPostCommandSchema,
  supplierBillPostResultSchema,
  type SupplierBillPostCommand,
  type SupplierBillPostResult,
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

function commandHash(supplierBillId: string, command: SupplierBillPostCommand) {
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

function replayResult(value: unknown): SupplierBillPostResult {
  const parsed = supplierBillPostResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Supplier Bill posting idempotency result is invalid'
    )
  }
  return parsed.data
}

function mapDatabaseFailure(error: unknown): never {
  const message = databaseErrorMessage(error)
  if (message.includes('Supplier bill not found')) {
    throw new NotFoundException('Supplier bill not found')
  }
  if (message.includes('Actor cannot post this supplier bill')) {
    throw new ForbiddenException('Actor cannot post this supplier bill')
  }
  if (
    message.includes('Only an unposted draft supplier bill can be posted') ||
    message.includes('Purchase Order not found for supplier bill') ||
    message.includes('Purchase Order must be approved and issued before billing') ||
    message.includes('Supplier bill Vendor or project does not match Purchase Order') ||
    message.includes('Supplier bill allocations must equal subtotal') ||
    message.includes('Supplier bill allocations must match the bill project') ||
    message.includes('Supplier bill allocations do not satisfy three-way account control') ||
    message.includes('Supplier bill exceeds unbilled Purchase Order subtotal') ||
    message.includes('Active Accounts Payable control account is required') ||
    message.includes('Active Input VAT control account is required') ||
    message.includes('Active Withholding Tax Payable control account is required') ||
    message.includes('Posting date cannot precede supplier bill date') ||
    message.includes('Posting date is not in an open fiscal period') ||
    message.includes('Supplier bill line requires') ||
    message.includes('Supplier bill amount exceeds') ||
    message.includes('Supplier bill quantity exceeds') ||
    message.includes('Inventory bill line requires') ||
    message.includes('Non-inventory bill line')
  ) {
    throw new ConflictException(message)
  }
  throw error
}

@Injectable()
export class SupplierBillPostService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async post(
    supplierBillId: string,
    command: SupplierBillPostCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<SupplierBillPostResult> {
    const parsedCommand = supplierBillPostCommandSchema.parse(command)
    const idempotencyKey = validateKey(rawIdempotencyKey)
    const enabled = this.config.get<boolean>(
      'ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Supplier Bill posting is not enabled for this tenant; no supplier bill was posted.'
      )
    }

    const requestHash = commandHash(supplierBillId, parsedCommand)
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
        journal_entry_id: string
        journal_entry_number: string
        supplier_bill_number: string
      }>
      try {
        rows = await transaction.execute(sql`
          select journal_entry_id, journal_entry_number, supplier_bill_number
          from public.post_supplier_bill(
            ${bill.id}::uuid,
            ${authorizedPrincipal.userId}::uuid,
            ${parsedCommand.postingDate}::date
          )
        `)
      } catch (error) {
        mapDatabaseFailure(error)
      }
      const posted = rows[0]
      if (!posted) {
        throw new InternalServerErrorException(
          'Supplier Bill posting returned no result'
        )
      }

      const result = supplierBillPostResultSchema.parse({
        supplierBillId: bill.id,
        tenantId: authorizedPrincipal.tenantId,
        status: 'posted',
        supplierBillNumber: posted.supplier_bill_number,
        journalEntryId: posted.journal_entry_id,
        journalEntryNumber: posted.journal_entry_number,
      })
      await this.completeRequest(transaction, request.id, result)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'supplier_bill',
        entityId: bill.id,
        action: 'status_change',
        diff: {
          from: 'draft',
          to: 'posted',
          supplier_bill_number: posted.supplier_bill_number,
          journal_entry_id: posted.journal_entry_id,
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
      .insert(supplierBillPostRequests)
      .values({
        tenant_id: principal.tenantId,
        supplier_bill_id: supplierBillId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          supplierBillPostRequests.tenant_id,
          supplierBillPostRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: supplierBillPostRequests.id,
        requestHash: supplierBillPostRequests.request_hash,
        supplierBillId: supplierBillPostRequests.supplier_bill_id,
        state: supplierBillPostRequests.state,
        result: supplierBillPostRequests.result,
      })
      .from(supplierBillPostRequests)
      .where(
        and(
          eq(supplierBillPostRequests.tenant_id, principal.tenantId),
          eq(supplierBillPostRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Supplier Bill posting idempotency record was not created'
      )
    }
    if (
      request.requestHash !== requestHash ||
      request.supplierBillId !== supplierBillId
    ) {
      throw new ConflictException(
        'Idempotency key was already used with a different Supplier Bill posting command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Supplier Bill posting idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: SupplierBillPostResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(supplierBillPostRequests)
      .set({
        state: 'succeeded',
        result,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(supplierBillPostRequests.id, requestId),
          eq(supplierBillPostRequests.state, 'processing')
        )
      )
      .returning({ id: supplierBillPostRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Supplier Bill posting idempotency record changed before completion'
      )
    }
  }
}
