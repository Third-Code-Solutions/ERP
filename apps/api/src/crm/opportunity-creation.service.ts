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
  accounts,
  opportunities,
  opportunityStageTransitionRequests,
  projects,
  users,
} from '@third-code-erp/database/schema'
import {
  opportunityCreationCommandSchema,
  opportunityCreationResultSchema,
  STAGE_PROBABILITY,
  type OpportunityCreationCommand,
  type OpportunityCreationResult,
} from '@third-code-erp/shared-types'
import { and, eq, isNull } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type {
  ErpPrincipal,
  ErpRole,
} from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

const CREATE_LEDGER_PREFIX = 'opportunity-create:'
const MAX_RAW_IDEMPOTENCY_KEY_LENGTH = 256 - CREATE_LEDGER_PREFIX.length
const INITIAL_STAGE = 'opportunity_creation' as const

type CreateRequestRecord = {
  id: string
  opportunityId: string
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

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function commandHash(command: OpportunityCreationCommand): string {
  return sha256(canonicalJson(command))
}

function validateIdempotencyKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > MAX_RAW_IDEMPOTENCY_KEY_LENGTH) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return `${CREATE_LEDGER_PREFIX}${key}`
}

function replayResult(value: unknown): OpportunityCreationResult {
  const parsed = opportunityCreationResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Opportunity creation idempotency result is invalid'
    )
  }
  return parsed.data
}

function exactPersistenceNumber(value: string): number {
  const amount = BigInt(value)
  if (
    amount < BigInt(Number.MIN_SAFE_INTEGER) ||
    amount > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new InternalServerErrorException(
      'Opportunity amount is outside the exact persistence range'
    )
  }
  return Number(amount)
}

function exactWeightedCentavos(
  tcvCentavos: string,
  probabilityPercent: number
): string {
  return (
    (BigInt(tcvCentavos) * BigInt(probabilityPercent) + 50n) /
    100n
  ).toString()
}

@Injectable()
export class OpportunityCreationService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    command: unknown,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<OpportunityCreationResult> {
    const parsedCommand = opportunityCreationCommandSchema.parse(command)
    const ledgerKey = validateIdempotencyKey(rawIdempotencyKey)
    this.assertWritesEnabled(principal)
    const requestHash = commandHash(parsedCommand)

    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.lockAuthorizedMembership(
        transaction,
        principal
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)

      const [project] = await transaction
        .select({ id: projects.id, accountId: projects.account_id })
        .from(projects)
        .where(
          and(
            eq(projects.id, parsedCommand.projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId),
            isNull(projects.deleted_at)
          )
        )
        .limit(1)
        .for('share')
      if (!project) throw new NotFoundException('Project not found')

      if (project.accountId) {
        const [account] = await transaction
          .select({ id: accounts.id })
          .from(accounts)
          .where(
            and(
              eq(accounts.id, project.accountId),
              eq(accounts.tenant_id, authorizedPrincipal.tenantId)
            )
          )
          .limit(1)
          .for('share')
        if (!account) {
          throw new ConflictException(
            'Project Account is not available in this tenant'
          )
        }
      }

      const existingRequest = await this.findRequest(
        transaction,
        authorizedPrincipal.tenantId,
        ledgerKey
      )
      if (existingRequest) {
        this.assertMatchingRequest(existingRequest, requestHash)
        if (existingRequest.state === 'succeeded') {
          return replayResult(existingRequest.result)
        }
        throw new ConflictException('Opportunity creation is already in progress')
      }

      const probability = STAGE_PROBABILITY[INITIAL_STAGE]
      const weightedTcvCentavos = exactWeightedCentavos(
        parsedCommand.tcvCents,
        probability
      )
      const closingDate = parsedCommand.closingDate
        ? new Date(parsedCommand.closingDate)
        : null
      const [created] = await transaction
        .insert(opportunities)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: project.id,
          account_id: project.accountId,
          rep_id: authorizedPrincipal.userId,
          stage: INITIAL_STAGE,
          probability,
          tcv_cents: exactPersistenceNumber(parsedCommand.tcvCents),
          gp_cents: exactPersistenceNumber(parsedCommand.gpCents),
          weighted_tcv_cents: exactPersistenceNumber(weightedTcvCentavos),
          closing_date: closingDate,
          area_sqm: parsedCommand.areaSqm,
          opportunity_type: parsedCommand.opportunityType,
          remarks: parsedCommand.remarks,
        })
        .returning()
      if (!created) throw new ConflictException('Opportunity was not created')

      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        created.id,
        ledgerKey,
        requestHash
      )
      this.assertMatchingRequest(request, requestHash)
      if (request.opportunityId !== created.id) {
        if (request.state !== 'succeeded') {
          throw new ConflictException('Opportunity creation is already in progress')
        }
        await transaction
          .delete(opportunities)
          .where(
            and(
              eq(opportunities.id, created.id),
              eq(opportunities.tenant_id, authorizedPrincipal.tenantId)
            )
          )
        return replayResult(request.result)
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Opportunity creation idempotency record has an unsupported state'
        )
      }

      const result = opportunityCreationResultSchema.parse({
        ok: true,
        opportunityId: created.id,
        tenantId: created.tenant_id,
        projectId: created.project_id,
        accountId: created.account_id,
        repId: created.rep_id,
        stage: created.stage,
        probability: created.probability,
        tcvCents: String(created.tcv_cents),
        gpCents: String(created.gp_cents),
        weightedTcvCents: String(created.weighted_tcv_cents),
        closingDate: created.closing_date?.toISOString() ?? null,
        areaSqm: created.area_sqm,
        opportunityType: created.opportunity_type,
        remarks: created.remarks,
        createdAt: created.created_at.toISOString(),
      })

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'opportunity',
        entityId: created.id,
        action: 'create',
        diff: {
          source: 'opportunity_create_core',
          project_id: project.id,
          account_id: project.accountId,
          rep_id: authorizedPrincipal.userId,
          stage: INITIAL_STAGE,
          probability,
          tcv_centavos: parsedCommand.tcvCents,
          gp_centavos: parsedCommand.gpCents,
          weighted_tcv_centavos: weightedTcvCentavos,
          closing_date: closingDate?.toISOString() ?? null,
          idempotency_key_hash: sha256(ledgerKey),
        },
      })
      await this.completeRequest(transaction, request.id, result)
      return result
    })
  }

  private assertWritesEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_OPPORTUNITY_STAGE_WRITES_ENABLED',
      false
    )
    const tenantIds = this.config.get<string[]>(
      'ERP_OPPORTUNITY_STAGE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !tenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Opportunity creation is not enabled for this tenant; no Opportunity was created.'
      )
    }
  }

  private async lockAuthorizedMembership(
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
    const role: ErpRole | undefined = membership?.role
    if (!membership || !role || !roleHasCapability(role, 'opportunity.create')) {
      throw new ForbiddenException()
    }
    return {
      userId: principal.userId,
      tenantId: membership.tenantId,
      role,
      email: membership.email,
    }
  }

  private async findRequest(
    transaction: DatabaseTransaction,
    tenantId: string,
    ledgerKey: string
  ): Promise<CreateRequestRecord | undefined> {
    const [request] = await transaction
      .select({
        id: opportunityStageTransitionRequests.id,
        opportunityId: opportunityStageTransitionRequests.opportunity_id,
        requestHash: opportunityStageTransitionRequests.request_hash,
        state: opportunityStageTransitionRequests.state,
        result: opportunityStageTransitionRequests.result,
      })
      .from(opportunityStageTransitionRequests)
      .where(
        and(
          eq(opportunityStageTransitionRequests.tenant_id, tenantId),
          eq(opportunityStageTransitionRequests.idempotency_key, ledgerKey)
        )
      )
      .limit(1)
      .for('update')
    return request
  }

  private async claimRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    opportunityId: string,
    ledgerKey: string,
    requestHash: string
  ): Promise<CreateRequestRecord> {
    await transaction
      .insert(opportunityStageTransitionRequests)
      .values({
        tenant_id: principal.tenantId,
        opportunity_id: opportunityId,
        idempotency_key: ledgerKey,
        request_hash: requestHash,
        from_stage: INITIAL_STAGE,
        to_stage: INITIAL_STAGE,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          opportunityStageTransitionRequests.tenant_id,
          opportunityStageTransitionRequests.idempotency_key,
        ],
      })
    const request = await this.findRequest(
      transaction,
      principal.tenantId,
      ledgerKey
    )
    if (!request) {
      throw new InternalServerErrorException(
        'Opportunity creation idempotency record was not created'
      )
    }
    return request
  }

  private assertMatchingRequest(
    request: CreateRequestRecord,
    requestHash: string
  ): void {
    if (request.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different Opportunity command'
      )
    }
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: OpportunityCreationResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(opportunityStageTransitionRequests)
      .set({
        state: 'succeeded',
        project_id: result.projectId,
        result,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(opportunityStageTransitionRequests.id, requestId),
          eq(opportunityStageTransitionRequests.state, 'processing')
        )
      )
      .returning({ id: opportunityStageTransitionRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Opportunity creation idempotency record changed before completion'
      )
    }
  }
}
