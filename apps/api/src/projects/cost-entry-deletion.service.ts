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
  costEntries,
  costEntryDeleteRequests,
  costEntryRestoreRequests,
  users,
} from '@third-code-erp/database/schema'
import {
  costEntryRestoreResultSchema,
  costEntryDeletionResultSchema,
  deleteCostEntryCommandSchema,
  restoreCostEntryCommandSchema,
  type CostEntryRestoreResult,
  type CostEntryDeletionResult,
  type DeleteCostEntryCommand,
  type RestoreCostEntryCommand,
} from '@third-code-erp/shared-types'
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

type CostEntryDeleteRequestRecord = {
  id: string
  projectId: string
  costEntryId: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
  snapshot: unknown
}

type CostEntryRestoreRequestRecord = {
  id: string
  projectId: string
  costEntryId: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
  snapshot: unknown
}

type CostEntryVoidSnapshot = {
  costEntryId: string
  projectId: string
  costSource: 'manual'
  voidedAt: string | null
  voidedBy: string | null
  voidReason: string | null
}

function commandHash(command: DeleteCostEntryCommand): string {
  return createHash('sha256')
    .update(JSON.stringify({ action: 'void', command }))
    .digest('hex')
}

function restoreCommandHash(command: RestoreCostEntryCommand): string {
  return createHash('sha256')
    .update(JSON.stringify({ action: 'restore', command }))
    .digest('hex')
}

function validateIdempotencyKey(raw: string | undefined): string {
  const key = raw?.trim() ?? ''
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): CostEntryDeletionResult {
  const parsed = costEntryDeletionResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Cost entry deletion idempotency result is invalid'
    )
  }
  return parsed.data
}

function replayRestoreResult(value: unknown): CostEntryRestoreResult {
  const parsed = costEntryRestoreResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Cost entry restore idempotency result is invalid'
    )
  }
  return parsed.data
}

function validateVoidSnapshot(
  value: unknown,
  command: RestoreCostEntryCommand
): CostEntryVoidSnapshot {
  if (!value || typeof value !== 'object') {
    throw new InternalServerErrorException(
      'Cost entry void snapshot is invalid'
    )
  }
  const snapshot = value as Record<string, unknown>
  const nullableString = (field: string): string | null => {
    const candidate = snapshot[field]
    if (candidate === null || typeof candidate === 'string') return candidate
    throw new InternalServerErrorException(
      'Cost entry void snapshot is invalid'
    )
  }
  if (
    snapshot.costEntryId !== command.costEntryId ||
    snapshot.projectId !== command.projectId ||
    snapshot.costSource !== 'manual'
  ) {
    throw new InternalServerErrorException(
      'Cost entry void snapshot does not match the restore target'
    )
  }
  const voidedAt = nullableString('voidedAt')
  const voidedBy = nullableString('voidedBy')
  const voidReason = nullableString('voidReason')
  if (voidedAt !== null || voidedBy !== null || voidReason !== null) {
    throw new ConflictException(
      'Cost entry restore snapshot is not an active-entry snapshot.'
    )
  }
  return {
    costEntryId: command.costEntryId,
    projectId: command.projectId,
    costSource: 'manual',
    voidedAt,
    voidedBy,
    voidReason,
  }
}

@Injectable()
export class CostEntryDeletionService {
  constructor(
    @Optional()
    @Inject(ConfigService)
    private readonly config: ConfigService | undefined,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async delete(
    projectId: string,
    costEntryId: string,
    reason: string,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined
  ): Promise<CostEntryDeletionResult> {
    const command = deleteCostEntryCommandSchema.parse({
      projectId,
      costEntryId,
      reason,
    })
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    this.assertEnabled(principal)
    const requestHash = commandHash(command)

    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        command,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replayResult(request.result)

      const [entry] = await transaction
        .select({
          id: costEntries.id,
          tenantId: costEntries.tenant_id,
          projectId: costEntries.project_id,
          costSource: costEntries.cost_source,
          voidedAt: costEntries.voided_at,
          voidedBy: costEntries.voided_by,
          voidReason: costEntries.void_reason,
        })
        .from(costEntries)
        .where(
          and(
            eq(costEntries.id, command.costEntryId),
            eq(costEntries.project_id, command.projectId),
            eq(costEntries.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!entry) throw new NotFoundException('Cost entry not found')
      if (entry.costSource !== 'manual') {
        throw new ConflictException(
          'PO-derived and imported cost entries are system-managed and cannot be deleted.'
        )
      }
      if (entry.voidedAt) {
        throw new ConflictException('Cost entry is already voided.')
      }

      const [voided] = await transaction
        .update(costEntries)
        .set({
          voided_at: new Date(),
          voided_by: authorizedPrincipal.userId,
          void_reason: command.reason,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(costEntries.id, command.costEntryId),
            eq(costEntries.project_id, command.projectId),
            eq(costEntries.tenant_id, authorizedPrincipal.tenantId),
            isNull(costEntries.voided_at)
          )
        )
        .returning({
          id: costEntries.id,
          tenantId: costEntries.tenant_id,
          projectId: costEntries.project_id,
          costSource: costEntries.cost_source,
          voidedAt: costEntries.voided_at,
        })
      if (!voided?.voidedAt) {
        throw new ConflictException('Cost entry changed before it was voided.')
      }

      const result = costEntryDeletionResultSchema.parse({
        costEntryId: voided.id,
        tenantId: voided.tenantId,
        projectId: voided.projectId,
        costSource: voided.costSource,
        status: 'voided',
        voidedAt: voided.voidedAt.toISOString(),
        restorable: true,
      })
      const snapshot: CostEntryVoidSnapshot = {
        costEntryId: entry.id,
        projectId: entry.projectId,
        costSource: entry.costSource,
        voidedAt: entry.voidedAt,
        voidedBy: entry.voidedBy,
        voidReason: entry.voidReason,
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'cost_entry',
        entityId: voided.id,
        action: 'delete',
        diff: {
          project_id: voided.projectId,
          cost_source: voided.costSource,
          status: 'voided',
          restorable: true,
          reason_length: command.reason.length,
          idempotency_key_hash: requestHash,
        },
      })
      await this.completeRequest(transaction, request.id, result, snapshot)
      return result
    })
  }

  async restore(
    projectId: string,
    costEntryId: string,
    reason: string,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined
  ): Promise<CostEntryRestoreResult> {
    const command = restoreCostEntryCommandSchema.parse({
      projectId,
      costEntryId,
      reason,
    })
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    this.assertRestoreEnabled(principal)
    const requestHash = restoreCommandHash(command)

    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const request = await this.claimRestoreRequest(
        transaction,
        authorizedPrincipal,
        command,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') {
        return replayRestoreResult(request.result)
      }

      const [entry] = await transaction
        .select({
          id: costEntries.id,
          tenantId: costEntries.tenant_id,
          projectId: costEntries.project_id,
          costSource: costEntries.cost_source,
          voidedAt: costEntries.voided_at,
          voidedBy: costEntries.voided_by,
          voidReason: costEntries.void_reason,
        })
        .from(costEntries)
        .where(
          and(
            eq(costEntries.id, command.costEntryId),
            eq(costEntries.project_id, command.projectId),
            eq(costEntries.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!entry) throw new NotFoundException('Cost entry not found')
      if (entry.costSource !== 'manual') {
        throw new ConflictException(
          'PO-derived and imported cost entries are system-managed and cannot be restored.'
        )
      }
      if (!entry.voidedAt) {
        throw new ConflictException('Cost entry is not voided.')
      }

      const [voidRequest] = await transaction
        .select({
          snapshot: costEntryDeleteRequests.snapshot,
        })
        .from(costEntryDeleteRequests)
        .where(
          and(
            eq(costEntryDeleteRequests.tenant_id, authorizedPrincipal.tenantId),
            eq(costEntryDeleteRequests.project_id, command.projectId),
            eq(costEntryDeleteRequests.cost_entry_id, command.costEntryId),
            eq(costEntryDeleteRequests.state, 'succeeded'),
            isNotNull(costEntryDeleteRequests.snapshot)
          )
        )
        .orderBy(desc(costEntryDeleteRequests.created_at))
        .limit(1)
        .for('update')
      if (!voidRequest?.snapshot) {
        throw new ConflictException('Cost entry void snapshot is unavailable.')
      }
      const voidSnapshot = validateVoidSnapshot(voidRequest.snapshot, command)

      const [restored] = await transaction
        .update(costEntries)
        .set({
          voided_at: null,
          voided_by: null,
          void_reason: null,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(costEntries.id, command.costEntryId),
            eq(costEntries.project_id, command.projectId),
            eq(costEntries.tenant_id, authorizedPrincipal.tenantId),
            isNotNull(costEntries.voided_at)
          )
        )
        .returning({
          id: costEntries.id,
          tenantId: costEntries.tenant_id,
          projectId: costEntries.project_id,
          costSource: costEntries.cost_source,
        })
      if (!restored) {
        throw new ConflictException('Cost entry changed before it was restored.')
      }

      const restoredAt = new Date()
      const result = costEntryRestoreResultSchema.parse({
        costEntryId: restored.id,
        tenantId: restored.tenantId,
        projectId: restored.projectId,
        costSource: restored.costSource,
        status: 'restored',
        restoredAt: restoredAt.toISOString(),
        restorable: false,
      })

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'cost_entry',
        entityId: restored.id,
        action: 'update',
        diff: {
          project_id: restored.projectId,
          cost_source: restored.costSource,
          status: 'restored',
          reason_length: command.reason.length,
          idempotency_key_hash: requestHash,
        },
      })
      await this.completeRestoreRequest(transaction, request.id, result, {
        ...voidSnapshot,
        voidedAt: entry.voidedAt.toISOString(),
        voidedBy: entry.voidedBy,
        voidReason: entry.voidReason,
      })
      return result
    })
  }

  private assertEnabled(principal: ErpPrincipal): void {
    const enabled =
      this.config?.get<boolean>('ERP_COST_ENTRY_DELETE_WRITES_ENABLED', false) ??
      false
    const allowedTenantIds =
      this.config?.get<string[]>('ERP_COST_ENTRY_DELETE_WRITES_TENANT_IDS', []) ??
      []
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cost entry deletion is not enabled for this tenant; no cost entry was changed.'
      )
    }
  }

  private assertRestoreEnabled(principal: ErpPrincipal): void {
    const enabled =
      this.config?.get<boolean>('ERP_COST_ENTRY_RESTORE_WRITES_ENABLED', false) ??
      false
    const allowedTenantIds =
      this.config?.get<string[]>('ERP_COST_ENTRY_RESTORE_WRITES_TENANT_IDS', []) ??
      []
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Cost entry restoration is not enabled for this tenant; no cost entry was changed.'
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
    if (!membership || !role || !roleHasCapability(role, 'cost.record')) {
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
    command: DeleteCostEntryCommand,
    idempotencyKey: string,
    requestHash: string
  ): Promise<CostEntryDeleteRequestRecord> {
    await transaction
      .insert(costEntryDeleteRequests)
      .values({
        tenant_id: principal.tenantId,
        project_id: command.projectId,
        cost_entry_id: command.costEntryId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          costEntryDeleteRequests.tenant_id,
          costEntryDeleteRequests.idempotency_key,
        ],
      })

    const [request] = await transaction
      .select({
        id: costEntryDeleteRequests.id,
        projectId: costEntryDeleteRequests.project_id,
        costEntryId: costEntryDeleteRequests.cost_entry_id,
        requestHash: costEntryDeleteRequests.request_hash,
        state: costEntryDeleteRequests.state,
        result: costEntryDeleteRequests.result,
        snapshot: costEntryDeleteRequests.snapshot,
      })
      .from(costEntryDeleteRequests)
      .where(
        and(
          eq(costEntryDeleteRequests.tenant_id, principal.tenantId),
          eq(costEntryDeleteRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Cost entry deletion idempotency record was not created'
      )
    }
    if (
      request.requestHash !== requestHash ||
      request.projectId !== command.projectId ||
      request.costEntryId !== command.costEntryId
    ) {
      throw new ConflictException(
        'Idempotency key was already used with a different cost entry command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Cost entry deletion idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: CostEntryDeletionResult,
    snapshot: CostEntryVoidSnapshot
  ): Promise<void> {
    const [completed] = await transaction
      .update(costEntryDeleteRequests)
      .set({
        state: 'succeeded',
        result,
        snapshot,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(costEntryDeleteRequests.id, requestId),
          eq(costEntryDeleteRequests.state, 'processing')
        )
      )
      .returning({ id: costEntryDeleteRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Cost entry deletion idempotency record changed before completion'
      )
    }
  }

  private async claimRestoreRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    command: RestoreCostEntryCommand,
    idempotencyKey: string,
    requestHash: string
  ): Promise<CostEntryRestoreRequestRecord> {
    await transaction
      .insert(costEntryRestoreRequests)
      .values({
        tenant_id: principal.tenantId,
        project_id: command.projectId,
        cost_entry_id: command.costEntryId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          costEntryRestoreRequests.tenant_id,
          costEntryRestoreRequests.idempotency_key,
        ],
      })

    const [request] = await transaction
      .select({
        id: costEntryRestoreRequests.id,
        projectId: costEntryRestoreRequests.project_id,
        costEntryId: costEntryRestoreRequests.cost_entry_id,
        requestHash: costEntryRestoreRequests.request_hash,
        state: costEntryRestoreRequests.state,
        result: costEntryRestoreRequests.result,
        snapshot: costEntryRestoreRequests.snapshot,
      })
      .from(costEntryRestoreRequests)
      .where(
        and(
          eq(costEntryRestoreRequests.tenant_id, principal.tenantId),
          eq(costEntryRestoreRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Cost entry restore idempotency record was not created'
      )
    }
    if (
      request.requestHash !== requestHash ||
      request.projectId !== command.projectId ||
      request.costEntryId !== command.costEntryId
    ) {
      throw new ConflictException(
        'Idempotency key was already used with a different cost entry restore command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Cost entry restore idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRestoreRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: CostEntryRestoreResult,
    snapshot: CostEntryVoidSnapshot
  ): Promise<void> {
    const [completed] = await transaction
      .update(costEntryRestoreRequests)
      .set({
        state: 'succeeded',
        result,
        snapshot,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(costEntryRestoreRequests.id, requestId),
          eq(costEntryRestoreRequests.state, 'processing')
        )
      )
      .returning({ id: costEntryRestoreRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Cost entry restore idempotency record changed before completion'
      )
    }
  }
}
