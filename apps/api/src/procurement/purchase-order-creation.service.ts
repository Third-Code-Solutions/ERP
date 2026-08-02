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
  bomLineItems,
  boms,
  costCodes,
  poLineItems,
  projectBudgetLines,
  projectBudgets,
  projects,
  purchaseOrderCreateRequests,
  purchaseOrders,
  users,
  vendors,
} from '@third-code-erp/database/schema'
import {
  createPurchaseOrderFromBomCommandSchema,
  createPurchaseOrderCommandSchema,
  purchaseOrderBomCreationResultSchema,
  purchaseOrderCreationResultSchema,
  type CreatePurchaseOrderFromBomCommand,
  type CreatePurchaseOrderCommand,
  type PurchaseOrderCreationResult,
} from '@third-code-erp/shared-types'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n
const MAX_PO_QUANTITY = 2_147_483_647

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

function commandHash(command: CreatePurchaseOrderCommand): string {
  return createHash('sha256')
    .update(canonicalJson(command))
    .digest('hex')
}

function bomCommandHash(command: CreatePurchaseOrderFromBomCommand): string {
  return createHash('sha256')
    .update(canonicalJson(command))
    .digest('hex')
}

function percentHalfUp(value: bigint, percent: bigint): bigint {
  return (value * percent + 50n) / 100n
}

function safeDatabaseCents(value: bigint): number {
  if (value < 0n || value > MAX_POSTGRES_BIGINT) {
    throw new ConflictException(
      'Purchase Order amount exceeds PostgreSQL centavo range'
    )
  }
  if (value > MAX_SAFE_INTEGER_BIGINT) {
    throw new ConflictException(
      'Purchase Order amount exceeds supported exact centavo range'
    )
  }
  return Number(value)
}

function nextPoNumber(maxNumericSuffix: string | null): string {
  const next = BigInt(maxNumericSuffix ?? '0') + 1n
  return `PO-${next.toString().padStart(4, '0')}`
}

function replayResult(value: unknown): PurchaseOrderCreationResult {
  const parsed = purchaseOrderCreationResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Purchase Order idempotency result is invalid'
    )
  }
  return parsed.data
}

function replayBomResult(value: unknown) {
  const parsed = purchaseOrderBomCreationResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Purchase Order BOM idempotency result is invalid'
    )
  }
  return parsed.data
}

@Injectable()
export class PurchaseOrderCreationService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async createFromBom(
    command: CreatePurchaseOrderFromBomCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ) {
    const parsedCommand = createPurchaseOrderFromBomCommandSchema.parse(command)
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_PO_BOM_CREATE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_PO_BOM_CREATE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'BOM Purchase Order command is not enabled for this tenant; no Purchase Order was created.'
      )
    }

    const requestHash = bomCommandHash(parsedCommand)
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
      if (!membership || !role || !roleHasCapability(role, 'po.create')) {
        throw new ForbiddenException()
      }
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role,
        email: membership.email,
      }
      await this.audit.stampActor(transaction, authorizedPrincipal)

      await transaction
        .insert(purchaseOrderCreateRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoNothing({
          target: [
            purchaseOrderCreateRequests.tenant_id,
            purchaseOrderCreateRequests.idempotency_key,
          ],
        })

      const [request] = await transaction
        .select({
          id: purchaseOrderCreateRequests.id,
          requestHash: purchaseOrderCreateRequests.request_hash,
          state: purchaseOrderCreateRequests.state,
          result: purchaseOrderCreateRequests.result,
        })
        .from(purchaseOrderCreateRequests)
        .where(
          and(
            eq(
              purchaseOrderCreateRequests.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(
              purchaseOrderCreateRequests.idempotency_key,
              idempotencyKey
            )
          )
        )
        .limit(1)
        .for('update')

      if (!request) {
        throw new InternalServerErrorException(
          'Purchase Order BOM idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different Purchase Order BOM command'
        )
      }
      if (request.state === 'succeeded') {
        return replayBomResult(request.result)
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Purchase Order BOM idempotency record has an unsupported state'
        )
      }

      const [bom] = await transaction
        .select({
          id: boms.id,
          status: boms.status,
          projectId: boms.project_id,
          totalCostCents: boms.total_cost_cents,
        })
        .from(boms)
        .where(
          and(
            eq(boms.id, parsedCommand.bomId),
            eq(boms.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!bom) throw new NotFoundException('BOM not found')
      if (bom.status === 'draft') {
        throw new ConflictException(
          'BOM must be approved before generating a PO'
        )
      }
      if (bom.projectId !== parsedCommand.projectId) {
        throw new ConflictException('BOM belongs to a different project')
      }

      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, parsedCommand.projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('share')
      if (!project) throw new NotFoundException('Project not found')

      if (parsedCommand.vendorId) {
        const [vendor] = await transaction
          .select({ id: vendors.id })
          .from(vendors)
          .where(
            and(
              eq(vendors.id, parsedCommand.vendorId),
              eq(vendors.tenant_id, authorizedPrincipal.tenantId)
            )
          )
          .limit(1)
          .for('share')
        if (!vendor) throw new NotFoundException('Vendor not found')
      }

      const lines = await transaction
        .select({
          id: bomLineItems.id,
          code: bomLineItems.code,
          description: bomLineItems.description,
          unit: bomLineItems.unit,
          quantity: bomLineItems.quantity,
          unitCostCents: bomLineItems.unit_cost_cents,
        })
        .from(bomLineItems)
        .where(
          and(
            eq(bomLineItems.bom_id, parsedCommand.bomId),
            eq(bomLineItems.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .orderBy(bomLineItems.sort_order, bomLineItems.id)
        .for('share')
      if (lines.length === 0) {
        throw new ConflictException('BOM has no line items')
      }
      if (lines.length > 500) {
        throw new ConflictException('BOM has too many line items')
      }

      const budgetRows = await transaction
        .select({
          bomLineItemId: projectBudgetLines.bom_line_item_id,
          costCodeId: projectBudgetLines.cost_code_id,
        })
        .from(projectBudgetLines)
        .innerJoin(
          projectBudgets,
          and(
            eq(projectBudgets.id, projectBudgetLines.project_budget_id),
            eq(projectBudgets.tenant_id, projectBudgetLines.tenant_id)
          )
        )
        .where(
          and(
            eq(projectBudgetLines.tenant_id, authorizedPrincipal.tenantId),
            eq(projectBudgets.project_id, parsedCommand.projectId),
            eq(projectBudgets.source_bom_id, parsedCommand.bomId),
            eq(projectBudgets.status, 'approved')
          )
        )
        .for('share')
      const costCodeByBomLine = new Map(
        budgetRows.flatMap((row) =>
          row.bomLineItemId
            ? [[row.bomLineItemId, row.costCodeId] as const]
            : []
        )
      )

      const subtotalCents = BigInt(bom.totalCostCents)
      const vatCents = percentHalfUp(subtotalCents, 12n)
      const withholdingTaxCents = percentHalfUp(subtotalCents, 2n)
      const totalCents = subtotalCents + vatCents - withholdingTaxCents
      const subtotal = safeDatabaseCents(subtotalCents)
      const vat = safeDatabaseCents(vatCents)
      const withholdingTax = safeDatabaseCents(withholdingTaxCents)
      const total = safeDatabaseCents(totalCents)

      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`purchase_order_number:${authorizedPrincipal.tenantId}`}, 0))`
      )
      const [numberRecord] = await transaction
        .select({
          maxNumericSuffix: sql<string | null>`max(
            case
              when ${purchaseOrders.po_number} ~ '[0-9]+$'
              then substring(${purchaseOrders.po_number} from '[0-9]+$')::bigint
              else null
            end
          )`,
        })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.tenant_id, authorizedPrincipal.tenantId))
      const poNumber = nextPoNumber(numberRecord?.maxNumericSuffix ?? null)
      const [created] = await transaction
        .insert(purchaseOrders)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: parsedCommand.projectId,
          vendor_id: parsedCommand.vendorId ?? undefined,
          created_by: authorizedPrincipal.userId,
          po_number: poNumber,
          status: 'draft',
          subtotal_cents: subtotal,
          vat_cents: vat,
          withholding_tax_cents: withholdingTax,
          total_cents: total,
          delivery_date: parsedCommand.deliveryDate
            ? new Date(parsedCommand.deliveryDate)
            : undefined,
          notes: parsedCommand.notes ?? undefined,
        })
        .returning({
          id: purchaseOrders.id,
          poNumber: purchaseOrders.po_number,
        })
      if (!created) {
        throw new InternalServerErrorException(
          'Purchase Order insert returned no record'
        )
      }

      await transaction.insert(poLineItems).values(
        lines.map((line, index) => {
          const unitCost = BigInt(line.unitCostCents)
          const lineTotal = safeDatabaseCents(
            unitCost * BigInt(line.quantity)
          )
          return {
            tenant_id: authorizedPrincipal.tenantId,
            po_id: created.id,
            sort_order: index,
            code: line.code ?? undefined,
            description: line.description,
            unit: line.unit ?? undefined,
            quantity: line.quantity,
            unit_cost_cents: safeDatabaseCents(unitCost),
            line_total_cents: lineTotal,
            bom_line_item_id: line.id,
            cost_code_id: costCodeByBomLine.get(line.id),
          }
        })
      )

      const now = new Date()
      if (bom.status === 'approved') {
        await transaction
          .update(boms)
          .set({ status: 'locked', locked_at: now, updated_at: now })
          .where(
            and(
              eq(boms.id, parsedCommand.bomId),
              eq(boms.tenant_id, authorizedPrincipal.tenantId),
              eq(boms.status, 'approved')
            )
          )
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'bom',
          entityId: parsedCommand.bomId,
          action: 'lock',
          diff: { reason: 'PO generated', po_id: created.id },
        })
      }

      const result = purchaseOrderBomCreationResultSchema.parse({
        purchaseOrderId: created.id,
        tenantId: authorizedPrincipal.tenantId,
        bomId: parsedCommand.bomId,
        poNumber: created.poNumber,
        status: 'draft',
      })
      const [completed] = await transaction
        .update(purchaseOrderCreateRequests)
        .set({
          state: 'succeeded',
          purchase_order_id: created.id,
          result,
          completed_at: now,
        })
        .where(
          and(
            eq(purchaseOrderCreateRequests.id, request.id),
            eq(purchaseOrderCreateRequests.state, 'processing')
          )
        )
        .returning({ id: purchaseOrderCreateRequests.id })
      if (!completed) {
        throw new InternalServerErrorException(
          'Purchase Order BOM idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'purchase_order',
        entityId: created.id,
        action: 'create',
        diff: {
          project_id: parsedCommand.projectId,
          vendor_id: parsedCommand.vendorId ?? null,
          bom_id: parsedCommand.bomId,
          subtotal_cents: subtotal,
          line_count: lines.length,
          idempotency_key_hash: requestHash,
          source: 'bom',
        },
      })

      return result
    })
  }

  async create(
    command: CreatePurchaseOrderCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<PurchaseOrderCreationResult> {
    const parsedCommand = createPurchaseOrderCommandSchema.parse(command)
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_PO_CREATE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_PO_CREATE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Purchase Order command is not enabled for this tenant; no Purchase Order was created.'
      )
    }

    const requestHash = commandHash(parsedCommand)
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
        !roleHasCapability(role, 'po.create')
      ) {
        throw new ForbiddenException()
      }
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role,
        email: membership.email,
      }
      await this.audit.stampActor(transaction, authorizedPrincipal)

      await transaction
        .insert(purchaseOrderCreateRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoNothing({
          target: [
            purchaseOrderCreateRequests.tenant_id,
            purchaseOrderCreateRequests.idempotency_key,
          ],
        })

      const [request] = await transaction
        .select({
          id: purchaseOrderCreateRequests.id,
          requestHash: purchaseOrderCreateRequests.request_hash,
          state: purchaseOrderCreateRequests.state,
          result: purchaseOrderCreateRequests.result,
        })
        .from(purchaseOrderCreateRequests)
        .where(
          and(
            eq(
              purchaseOrderCreateRequests.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(
              purchaseOrderCreateRequests.idempotency_key,
              idempotencyKey
            )
          )
        )
        .limit(1)
        .for('update')

      if (!request) {
        throw new InternalServerErrorException(
          'Purchase Order idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different Purchase Order command'
        )
      }
      if (request.state === 'succeeded') {
        return replayResult(request.result)
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Purchase Order idempotency record has an unsupported state'
        )
      }

      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, parsedCommand.projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('share')
      if (!project) throw new NotFoundException('Project not found')

      if (parsedCommand.vendorId) {
        const [vendor] = await transaction
          .select({ id: vendors.id })
          .from(vendors)
          .where(
            and(
              eq(vendors.id, parsedCommand.vendorId),
              eq(vendors.tenant_id, authorizedPrincipal.tenantId)
            )
          )
          .limit(1)
          .for('share')
        if (!vendor) throw new NotFoundException('Vendor not found')
      }

      const costCodeIds = [
        ...new Set(parsedCommand.lines.map((line) => line.costCodeId)),
      ]
      const selectedCostCodes = await transaction
        .select({ id: costCodes.id })
        .from(costCodes)
        .where(
          and(
            eq(costCodes.tenant_id, authorizedPrincipal.tenantId),
            eq(costCodes.is_active, true),
            inArray(costCodes.id, costCodeIds)
          )
        )
        .for('share')
      if (selectedCostCodes.length !== costCodeIds.length) {
        throw new NotFoundException(
          'Every Purchase Order line requires an active Cost Code'
        )
      }

      const lineValues = parsedCommand.lines.map((line, index) => {
        if (line.quantity > MAX_PO_QUANTITY) {
          throw new ConflictException(
            'Purchase Order quantity exceeds PostgreSQL integer range'
          )
        }
        const quantity = BigInt(line.quantity)
        const unitCost = BigInt(line.unitCostCents)
        const lineTotal = unitCost * quantity
        return {
          index,
          code: line.code ?? undefined,
          description: line.description,
          unit: line.unit ?? undefined,
          quantity: line.quantity,
          unitCostCents: safeDatabaseCents(unitCost),
          lineTotalCents: safeDatabaseCents(lineTotal),
          costCodeId: line.costCodeId,
          lineTotal,
        }
      })
      const subtotal = lineValues.reduce(
        (sum, line) => sum + line.lineTotal,
        0n
      )
      const vat = percentHalfUp(subtotal, 12n)
      const withholdingTax = percentHalfUp(subtotal, 2n)
      const total = subtotal + vat - withholdingTax
      const subtotalCents = safeDatabaseCents(subtotal)
      const vatCents = safeDatabaseCents(vat)
      const withholdingTaxCents = safeDatabaseCents(withholdingTax)
      const totalCents = safeDatabaseCents(total)

      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${
          'purchase_order_number:' + authorizedPrincipal.tenantId
        }, 0))`
      )
      const [numberRecord] = await transaction
        .select({
          maxNumericSuffix: sql<string | null>`max(
            case
              when ${purchaseOrders.po_number} ~ '[0-9]+$'
              then substring(${purchaseOrders.po_number} from '[0-9]+$')::bigint
              else null
            end
          )`,
        })
        .from(purchaseOrders)
        .where(
          eq(
            purchaseOrders.tenant_id,
            authorizedPrincipal.tenantId
          )
        )
      const poNumber = nextPoNumber(
        numberRecord?.maxNumericSuffix ?? null
      )

      const [created] = await transaction
        .insert(purchaseOrders)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: parsedCommand.projectId,
          vendor_id: parsedCommand.vendorId ?? undefined,
          created_by: authorizedPrincipal.userId,
          po_number: poNumber,
          status: 'draft',
          subtotal_cents: subtotalCents,
          vat_cents: vatCents,
          withholding_tax_cents: withholdingTaxCents,
          total_cents: totalCents,
          delivery_date: parsedCommand.deliveryDate
            ? new Date(parsedCommand.deliveryDate)
            : undefined,
          notes: parsedCommand.notes ?? undefined,
        })
        .returning({
          id: purchaseOrders.id,
          poNumber: purchaseOrders.po_number,
        })
      if (!created) {
        throw new InternalServerErrorException(
          'Purchase Order insert returned no record'
        )
      }

      await transaction.insert(poLineItems).values(
        lineValues.map((line) => ({
          tenant_id: authorizedPrincipal.tenantId,
          po_id: created.id,
          sort_order: line.index,
          code: line.code,
          description: line.description,
          unit: line.unit,
          quantity: line.quantity,
          unit_cost_cents: line.unitCostCents,
          line_total_cents: line.lineTotalCents,
          cost_code_id: line.costCodeId,
        }))
      )

      const result = purchaseOrderCreationResultSchema.parse({
        purchaseOrderId: created.id,
        tenantId: authorizedPrincipal.tenantId,
        poNumber: created.poNumber,
        status: 'draft',
      })
      const [completed] = await transaction
        .update(purchaseOrderCreateRequests)
        .set({
          state: 'succeeded',
          purchase_order_id: created.id,
          result,
          completed_at: new Date(),
        })
        .where(
          and(
            eq(purchaseOrderCreateRequests.id, request.id),
            eq(purchaseOrderCreateRequests.state, 'processing')
          )
        )
        .returning({ id: purchaseOrderCreateRequests.id })
      if (!completed) {
        throw new InternalServerErrorException(
          'Purchase Order idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'purchase_order',
        entityId: created.id,
        action: 'create',
        diff: {
          project_id: parsedCommand.projectId,
          vendor_id: parsedCommand.vendorId ?? null,
          subtotal_cents: subtotalCents,
          line_count: lineValues.length,
          idempotency_key_hash: requestHash,
        },
      })

      return result
    })
  }
}
