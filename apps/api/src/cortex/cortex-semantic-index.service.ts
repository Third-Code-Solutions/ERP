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
  cortexNodes,
  cortexSemanticIndexJobs,
  users,
  type CortexSemanticIndexJob,
} from '@third-code-erp/database/schema'
import {
  cortexSemanticIndexCommandSchema,
  cortexSemanticIndexStatusSchema,
  type CortexSemanticIndexCommand,
  type CortexSemanticIndexStatus,
} from '@third-code-erp/shared-types'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

export interface CortexSemanticIndexCreateResult {
  status: CortexSemanticIndexStatus
  created: boolean
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

function commandHash(command: CortexSemanticIndexCommand): string {
  return createHash('sha256').update(canonicalJson(command)).digest('hex')
}

function dateIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function statusFromRow(row: CortexSemanticIndexJob): CortexSemanticIndexStatus {
  const parsed = cortexSemanticIndexStatusSchema.safeParse({
    jobId: row.id,
    status: row.status,
    maxNodes: row.max_nodes,
    backlogAtRequest: row.backlog_at_request,
    processedNodes: row.processed_nodes,
    attempts: row.attempt_count,
    providerCalls: row.provider_call_count,
    failureCode: row.failure_code,
    createdAt: dateIso(row.created_at),
    updatedAt: dateIso(row.updated_at),
  })
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Cortex semantic index job state is invalid'
    )
  }
  return parsed.data
}

function parseIdempotencyKey(raw: string): string {
  const parsed = z.string().trim().min(1).max(256).safeParse(raw)
  if (!parsed.success) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return parsed.data
}

@Injectable()
export class CortexSemanticIndexService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    command: CortexSemanticIndexCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<CortexSemanticIndexCreateResult> {
    const parsedCommand = cortexSemanticIndexCommandSchema.parse(command)
    const idempotencyKey = parseIdempotencyKey(rawIdempotencyKey)
    this.assertIntakeEnabled(principal.tenantId)
    const requestHash = commandHash(parsedCommand)

    return this.database.client.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${
          'cortex-semantic-index:' + principal.tenantId
        }, 0))`
      )
      await this.audit.stampActor(transaction, principal)

      const [membership] = await transaction
        .select({ role: users.role })
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
      if (!role || !roleHasCapability(role, 'cortex.index.manage')) {
        throw new ForbiddenException('Cortex semantic indexing is not permitted')
      }

      const [existing] = await transaction
        .select()
        .from(cortexSemanticIndexJobs)
        .where(
          and(
            eq(cortexSemanticIndexJobs.tenant_id, principal.tenantId),
            eq(cortexSemanticIndexJobs.idempotency_key, idempotencyKey)
          )
        )
        .limit(1)
      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new ConflictException(
            'Idempotency-Key was already used for another request'
          )
        }
        return { status: statusFromRow(existing), created: false }
      }

      const [active] = await transaction
        .select({ id: cortexSemanticIndexJobs.id })
        .from(cortexSemanticIndexJobs)
        .where(
          and(
            eq(cortexSemanticIndexJobs.tenant_id, principal.tenantId),
            sql`${cortexSemanticIndexJobs.status} in ('queued', 'processing')`
          )
        )
        .limit(1)
      if (active) {
        throw new ConflictException(
          'A Cortex semantic index job is already active for this tenant'
        )
      }

      const [backlog] = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(cortexNodes)
        .where(
          and(
            eq(cortexNodes.tenant_id, principal.tenantId),
            isNull(cortexNodes.valid_to),
            isNull(cortexNodes.embedding)
          )
        )
      const backlogAtRequest = Number(backlog?.count ?? 0)
      const now = new Date()
      const terminal = backlogAtRequest === 0
      const [created] = await transaction
        .insert(cortexSemanticIndexJobs)
        .values({
          tenant_id: principal.tenantId,
          requested_by: principal.userId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          status: terminal ? 'succeeded' : 'queued',
          max_nodes: parsedCommand.maxNodes,
          backlog_at_request: backlogAtRequest,
          processed_nodes: 0,
          attempt_count: 0,
          provider_call_count: 0,
          failure_code: null,
          completed_at: terminal ? now : null,
          updated_at: now,
        })
        .returning()
      if (!created) {
        throw new InternalServerErrorException(
          'Cortex semantic index job was not created'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        entityType: 'cortex_semantic_index_job',
        entityId: created.id,
        action: 'create',
        diff: {
          maxNodes: created.max_nodes,
          backlogAtRequest: created.backlog_at_request,
          costConsent: true,
          providerCallCeiling: 1,
        },
      })
      return { status: statusFromRow(created), created: true }
    })
  }

  async status(
    rawJobId: string,
    principal: ErpPrincipal
  ): Promise<CortexSemanticIndexStatus> {
    const parsedJobId = z.string().uuid().safeParse(rawJobId)
    if (!parsedJobId.success) throw new BadRequestException('Invalid job id')

    const [membership] = await this.database.client
      .select({ role: users.role })
      .from(users)
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.tenant_id, principal.tenantId)
        )
      )
      .limit(1)
    const role = membership?.role as ErpRole | undefined
    if (!role || !roleHasCapability(role, 'cortex.index.read')) {
      throw new ForbiddenException('Cortex semantic indexing is not permitted')
    }

    const [row] = await this.database.client
      .select()
      .from(cortexSemanticIndexJobs)
      .where(
        and(
          eq(cortexSemanticIndexJobs.id, parsedJobId.data),
          eq(cortexSemanticIndexJobs.tenant_id, principal.tenantId)
        )
      )
      .limit(1)
    if (!row) throw new NotFoundException('Cortex semantic index job not found')
    return statusFromRow(row)
  }

  private assertIntakeEnabled(tenantId: string): void {
    const jobsEnabled = this.config.get<boolean>(
      'ERP_CORTEX_SEMANTIC_INDEX_JOBS_ENABLED',
      false
    )
    const workerEnabled = this.config.get<boolean>(
      'ERP_CORTEX_SEMANTIC_INDEX_WORKER_ENABLED',
      false
    )
    const jobsAllowed = this.config
      .get<string[]>('ERP_CORTEX_SEMANTIC_INDEX_JOBS_TENANT_IDS', [])
      .includes(tenantId)
    const workerAllowed = this.config
      .get<string[]>('ERP_CORTEX_SEMANTIC_INDEX_WORKER_TENANT_IDS', [])
      .includes(tenantId)
    if (!jobsEnabled || !workerEnabled || !jobsAllowed || !workerAllowed) {
      throw new ServiceUnavailableException(
        'Cortex semantic indexing is not enabled for this tenant'
      )
    }
  }
}
