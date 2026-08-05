import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  costCodes,
  costEntries,
  costEntryCreateRequests,
  projects,
  users,
} from '@third-code-erp/database/schema'
import {
  costEntryCreationResultSchema,
  createCostEntryCommandSchema,
  type CostEntryCreationResult,
  type CreateCostEntryCommand,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

type CostEntryCreateRequestRecord = {
  id: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
}

function commandHash(
  projectId: string,
  command: CreateCostEntryCommand
): string {
  return createHash('sha256')
    .update(JSON.stringify({ projectId, command }))
    .digest('hex')
}

function validateIdempotencyKey(raw: string | undefined): string {
  const key = raw?.trim() ?? ''
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): CostEntryCreationResult {
  const parsed = costEntryCreationResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Cost entry creation idempotency result is invalid'
    )
  }
  return parsed.data
}

@Injectable()
export class CostEntryCreationService {
  constructor(
    @Optional()
    @Inject(ConfigService)
    private readonly config: ConfigService | undefined,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    projectId: string,
    command: CreateCostEntryCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined
  ): Promise<CostEntryCreationResult> {
    const parsedCommand = createCostEntryCommandSchema.parse(command)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    const enabled = this.config?.get<boolean>(
      'ERP_COST_ENTRY_CREATE_WRITES_ENABLED',
      false
    ) ?? false
    const allowedTenantIds = this.config?.get<string[]>(
      'ERP_COST_ENTRY_CREATE_WRITES_TENANT_IDS',
      []
    ) ?? []
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cost entry creation is not enabled for this tenant; no cost entry was created.'
      )
    }

    const requestHash = commandHash(projectId, parsedCommand)
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
      if (!membership || !role || !roleHasCapability(role, 'cost.record')) {
        throw new ForbiddenException()
      }
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role,
        email: membership.email,
      }
      await this.audit.stampActor(transaction, authorizedPrincipal)

      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replayResult(request.result)
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Cost entry creation idempotency record has an unsupported state'
        )
      }

      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!project) throw new NotFoundException('Project not found')

      const [costCode] = await transaction
        .select({
          id: costCodes.id,
          category: costCodes.category,
          isActive: costCodes.is_active,
        })
        .from(costCodes)
        .where(
          and(
            eq(costCodes.id, parsedCommand.costCodeId),
            eq(costCodes.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!costCode || !costCode.isActive) {
        throw new ConflictException('Select an active Cost Code.')
      }
      if (costCode.category !== parsedCommand.costCategory) {
        throw new ConflictException(
          'Cost category must match the selected Cost Code.'
        )
      }

      const [created] = await transaction
        .insert(costEntries)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: project.id,
          cost_code_id: costCode.id,
          created_by: authorizedPrincipal.userId,
          cost_category: parsedCommand.costCategory,
          cost_source: 'manual',
          description: parsedCommand.description,
          amount_cents: parsedCommand.amountCents,
          quantity: parsedCommand.quantity,
          unit: parsedCommand.unit,
          incurred_at: parsedCommand.incurredAt
            ? new Date(parsedCommand.incurredAt)
            : new Date(),
          reference_number: parsedCommand.referenceNumber,
          notes: parsedCommand.notes,
        })
        .returning()
      if (!created) {
        throw new InternalServerErrorException('Cost entry was not created')
      }

      const result = costEntryCreationResultSchema.parse({
        id: created.id,
        tenantId: created.tenant_id,
        projectId: created.project_id,
        costCodeId: created.cost_code_id,
        costCategory: created.cost_category,
        costSource: created.cost_source,
        description: created.description,
        amountCents: created.amount_cents,
        quantity: created.quantity,
        unit: created.unit,
        incurredAt: created.incurred_at.toISOString(),
        referenceNumber: created.reference_number,
        notes: created.notes,
        createdAt: created.created_at.toISOString(),
      })
      await this.completeRequest(transaction, request.id, result)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'cost_entry',
        entityId: created.id,
        action: 'create',
        diff: {
          project_id: created.project_id,
          cost_code_id: created.cost_code_id,
          category: created.cost_category,
          amount_cents: created.amount_cents,
          idempotency_key_hash: requestHash,
        },
      })
      return result
    })
  }

  private async claimRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<CostEntryCreateRequestRecord> {
    await transaction
      .insert(costEntryCreateRequests)
      .values({
        tenant_id: principal.tenantId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          costEntryCreateRequests.tenant_id,
          costEntryCreateRequests.idempotency_key,
        ],
      })

    const [request] = await transaction
      .select({
        id: costEntryCreateRequests.id,
        requestHash: costEntryCreateRequests.request_hash,
        state: costEntryCreateRequests.state,
        result: costEntryCreateRequests.result,
      })
      .from(costEntryCreateRequests)
      .where(
        and(
          eq(costEntryCreateRequests.tenant_id, principal.tenantId),
          eq(costEntryCreateRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')

    if (!request) {
      throw new InternalServerErrorException(
        'Cost entry creation idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different cost entry command'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: CostEntryCreationResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(costEntryCreateRequests)
      .set({
        state: 'succeeded',
        cost_entry_id: result.id,
        result,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(costEntryCreateRequests.id, requestId),
          eq(costEntryCreateRequests.state, 'processing')
        )
      )
      .returning({ id: costEntryCreateRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Cost entry creation idempotency record changed before completion'
      )
    }
  }
}
