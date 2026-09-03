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
  opportunityKycTracks,
  opportunityStageTransitionRequests,
  slaLogs,
  users,
} from '@third-code-erp/database/schema'
import {
  opportunityStageTransitionCommandSchema,
  opportunityStageTransitionResultSchema,
  OPPORTUNITY_KYC_TRACK_TYPES,
  PIPELINE_STAGES,
  STAGE_LEGACY_MAP,
  STAGE_PROBABILITY,
  STAGE_TRANSITIONS,
  type OpportunityStage,
  type OpportunityStageTransitionCommand,
  type OpportunityStageTransitionResult,
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
import { OpportunityProjectConversionService } from './opportunity-project-conversion.service'

const TERMINAL_STAGES = new Set<OpportunityStage>([
  'won',
  'closed_won',
  'lost',
  'closed_lost',
])
const KYC_GATED_STAGES = new Set<OpportunityStage>([
  'design',
  'bom_submission',
  'negotiation',
  'contract',
  'won',
  'resubmission',
  'closed_won',
])
const OPP_STAGE_SLA = {
  breach_at_seconds: 5 * 86_400,
  warning_at_pct: 0.8,
} as const
const INVALID_LINKED_ACCOUNT_MESSAGE =
  'Opportunity Account is not available in this tenant'

type StageRequestRecord = {
  id: string
  requestHash: string
  state: 'processing' | 'succeeded'
  fromStage: OpportunityStage
  toStage: OpportunityStage
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

function commandHash(
  opportunityId: string,
  command: OpportunityStageTransitionCommand
): string {
  return createHash('sha256')
    .update(canonicalJson({ command, opportunityId }))
    .digest('hex')
}

function validateIdempotencyKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): OpportunityStageTransitionResult {
  const parsed = opportunityStageTransitionResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Opportunity stage transition idempotency result is invalid'
    )
  }
  return parsed.data
}

function exactWeightedTcvCents(
  tcvCents: number,
  probabilityPercent: number
): number {
  if (!Number.isSafeInteger(tcvCents) || tcvCents < 0) {
    throw new InternalServerErrorException(
      'Opportunity TCV is outside the supported integer range'
    )
  }
  return Number(
    (BigInt(tcvCents) * BigInt(probabilityPercent) + 50n) / 100n
  )
}

function exactPersistedCentavos(value: string): number {
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

@Injectable()
export class OpportunityStageTransitionService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OpportunityProjectConversionService)
    private readonly conversion: OpportunityProjectConversionService
  ) {}

  async transition(
    opportunityId: string,
    command: OpportunityStageTransitionCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<OpportunityStageTransitionResult> {
    const parsedCommand = opportunityStageTransitionCommandSchema.parse(command)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    this.assertStageWritesEnabled(principal)
    if (
      (parsedCommand.newStage === 'won' ||
        parsedCommand.newStage === 'closed_won') &&
      !this.conversionWritesEnabled(principal)
    ) {
      throw new ServiceUnavailableException(
        'Won-to-Project handoff is not enabled for this tenant; no stage change was committed.'
      )
    }
    const requestHash = commandHash(opportunityId, parsedCommand)
    return this.database.client.transaction((transaction) =>
      this.transitionInTransaction(
        transaction,
        opportunityId,
        parsedCommand,
        principal,
        idempotencyKey,
        requestHash
      )
    )
  }

  private async transitionInTransaction(
    transaction: DatabaseTransaction,
    opportunityId: string,
    command: OpportunityStageTransitionCommand,
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<OpportunityStageTransitionResult> {
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
      !roleHasCapability(role, 'opportunity.stage_change')
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

    const [opportunity] = await transaction
      .select({
        id: opportunities.id,
        tenantId: opportunities.tenant_id,
        stage: opportunities.stage,
        tcvCents: opportunities.tcv_cents,
        gpCents: opportunities.gp_cents,
        closingDate: opportunities.closing_date,
        accountId: opportunities.account_id,
        projectId: opportunities.project_id,
        lostReason: opportunities.lost_reason,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.id, opportunityId),
          eq(opportunities.tenant_id, authorizedPrincipal.tenantId)
        )
      )
      .limit(1)
      .for('update')
    if (!opportunity) throw new NotFoundException('Opportunity not found')

    let linkedAccount: { kycStatus: string } | null = null
    if (opportunity.accountId) {
      const [account] = await transaction
        .select({
          id: accounts.id,
          kycStatus: accounts.kyc_status,
        })
        .from(accounts)
        .where(
          and(
            eq(accounts.id, opportunity.accountId),
            eq(accounts.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('share')
      if (!account) {
        throw new ConflictException(INVALID_LINKED_ACCOUNT_MESSAGE)
      }
      linkedAccount = account
    }

    if (
      !linkedAccount &&
      [...KYC_GATED_STAGES].includes(command.newStage)
    ) {
      throw new ConflictException(
        'Opportunity Account is required before this stage'
      )
    }

    const request = await this.claimRequest(
      transaction,
      authorizedPrincipal,
      opportunityId,
      idempotencyKey,
      requestHash,
      opportunity.stage,
      command.newStage
    )
    if (request.state === 'succeeded') return replayResult(request.result)
    if (request.state !== 'processing') {
      throw new ConflictException(
        'Opportunity stage transition idempotency record has an unsupported state'
      )
    }

    const allowed = STAGE_TRANSITIONS[opportunity.stage as OpportunityStage] ?? []
    if (!allowed.includes(command.newStage)) {
      throw new ConflictException(
        `Cannot move from ${opportunity.stage} to ${command.newStage}`
      )
    }

    if (KYC_GATED_STAGES.has(command.newStage) && opportunity.accountId) {
      const kycTracks = await transaction
        .select({
          trackType: opportunityKycTracks.track_type,
          status: opportunityKycTracks.status,
        })
        .from(opportunityKycTracks)
        .where(
          and(
            eq(opportunityKycTracks.opportunity_id, opportunityId),
            eq(opportunityKycTracks.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .for('share')

      // PPRF opportunities have two independent Finance tracks. Once either
      // track exists, fail closed unless both canonical tracks are present and
      // approved. Account status remains the compatibility gate only for
      // legacy opportunities that pre-date the dual-track workflow.
      if (kycTracks.length > 0) {
        const approvedTrackTypes = new Set(
          kycTracks
            .filter((track) => track.status === 'approved')
            .map((track) => track.trackType)
        )
        const dualTrackApproved = OPPORTUNITY_KYC_TRACK_TYPES.every((trackType) =>
          approvedTrackTypes.has(trackType)
        )
        if (!dualTrackApproved) {
          throw new ConflictException(
            'Pipeline locked until both Finance tracks are approved'
          )
        }
      } else {
        const kycOk =
          linkedAccount?.kycStatus === 'approved' ||
          linkedAccount?.kycStatus === 'not_required'
        if (!kycOk) {
          throw new ConflictException(
            'Account KYC must be Approved before this stage'
          )
        }
      }
    }

    const currentPipelineStage =
      STAGE_LEGACY_MAP[opportunity.stage as OpportunityStage] ?? 'lead'
    const nextPipelineStage = STAGE_LEGACY_MAP[command.newStage]
    const isRegression =
      !!nextPipelineStage &&
      PIPELINE_STAGES.indexOf(nextPipelineStage) <
        PIPELINE_STAGES.indexOf(currentPipelineStage) &&
      nextPipelineStage !== 'lost'
    const reason = command.reason?.trim() || undefined
    const isClosingLost =
      command.newStage === 'closed_lost' || command.newStage === 'lost'
    if ((isRegression || isClosingLost) && !reason) {
      throw new ConflictException('reason_required')
    }

    const newProbability = STAGE_PROBABILITY[command.newStage]
    const newTcvCents =
      command.tcvCents === undefined
        ? opportunity.tcvCents
        : exactPersistedCentavos(command.tcvCents)
    const newGpCents =
      command.gpCents === undefined
        ? opportunity.gpCents
        : exactPersistedCentavos(command.gpCents)
    const newClosingDate = command.closingDate
      ? new Date(command.closingDate)
      : opportunity.closingDate
    const updateValues: {
      stage: OpportunityStage
      probability: number
      tcv_cents: number
      gp_cents: number
      weighted_tcv_cents: number
      closing_date: Date | null
      updated_at: Date
      lost_reason?: string | null
    } = {
      stage: command.newStage,
      probability: newProbability,
      tcv_cents: newTcvCents,
      gp_cents: newGpCents,
      weighted_tcv_cents: exactWeightedTcvCents(
        newTcvCents,
        newProbability
      ),
      closing_date: newClosingDate,
      updated_at: new Date(),
    }
    if (isClosingLost) updateValues.lost_reason = reason ?? null

    await transaction
      .update(opportunities)
      .set(updateValues)
      .where(
        and(
          eq(opportunities.id, opportunityId),
          eq(opportunities.tenant_id, authorizedPrincipal.tenantId)
        )
      )

    const auditDiff: Record<string, unknown> = {
      from: opportunity.stage,
      to: command.newStage,
      probability: newProbability,
      source: 'opportunity_stage_core',
      idempotency_key_hash: requestHash,
    }
    if (command.tcvCents !== undefined) {
      auditDiff.tcv_cents = {
        from: String(opportunity.tcvCents),
        to: String(newTcvCents),
      }
    }
    if (command.gpCents !== undefined) {
      auditDiff.gp_cents = {
        from: String(opportunity.gpCents),
        to: String(newGpCents),
      }
    }
    if (command.closingDate !== undefined) {
      auditDiff.closing_date = {
        from: opportunity.closingDate?.toISOString() ?? null,
        to: newClosingDate?.toISOString() ?? null,
      }
    }
    if (isClosingLost) {
      auditDiff.lost_reason = {
        from: opportunity.lostReason ?? null,
        to: reason ?? null,
      }
    }
    if (isRegression && reason) auditDiff.regression_reason = reason
    await this.audit.writeSemantic(transaction, {
      tenantId: authorizedPrincipal.tenantId,
      actorId: authorizedPrincipal.userId,
      entityType: 'opportunity',
      entityId: opportunityId,
      action: 'stage_change',
      diff: auditDiff,
    })

    await this.stopStageClock(transaction, authorizedPrincipal.tenantId, opportunityId)
    if (!TERMINAL_STAGES.has(command.newStage)) {
      await this.startStageClock(
        transaction,
        authorizedPrincipal.tenantId,
        opportunityId
      )
    }

    let projectId: string | null = null
    let checklistId: string | null = null
    let convertedToProject = false
    if (command.newStage === 'won' || command.newStage === 'closed_won') {
      const handoff = await this.conversion.convertWithinTransaction(
        transaction,
        opportunityId,
        {},
        authorizedPrincipal,
        `stage-${requestHash}`
      )
      projectId = handoff.projectId
      checklistId = handoff.checklistId
      convertedToProject = true
    }

    const result = opportunityStageTransitionResultSchema.parse({
      ok: true,
      opportunityId,
      tenantId: authorizedPrincipal.tenantId,
      fromStage: opportunity.stage,
      toStage: command.newStage,
      projectId,
      checklistId,
      convertedToProject,
    })
    await this.completeRequest(transaction, request.id, result)
    return result
  }

  private assertStageWritesEnabled(principal: ErpPrincipal): void {
    if (!this.config.get<boolean>('ERP_OPPORTUNITY_STAGE_WRITES_ENABLED', false)) {
      throw new ServiceUnavailableException(
        'Opportunity stage transitions are not enabled for this tenant; no stage change was committed.'
      )
    }
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_OPPORTUNITY_STAGE_WRITES_TENANT_IDS',
      []
    )
    if (!allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Opportunity stage transitions are not enabled for this tenant; no stage change was committed.'
      )
    }
  }

  private conversionWritesEnabled(principal: ErpPrincipal): boolean {
    return (
      this.config.get<boolean>('ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED', false) &&
      this.config
        .get<string[]>('ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS', [])
        .includes(principal.tenantId)
    )
  }

  private async stopStageClock(
    transaction: DatabaseTransaction,
    tenantId: string,
    opportunityId: string
  ): Promise<void> {
    await transaction
      .update(slaLogs)
      .set({ completed_at: new Date() })
      .where(
        and(
          eq(slaLogs.tenant_id, tenantId),
          eq(slaLogs.entity_type, 'opportunity'),
          eq(slaLogs.entity_id, opportunityId),
          eq(slaLogs.sla_label, 'opp.stage_response'),
          isNull(slaLogs.completed_at)
        )
      )
  }

  private async startStageClock(
    transaction: DatabaseTransaction,
    tenantId: string,
    opportunityId: string
  ): Promise<void> {
    const [open] = await transaction
      .select({ id: slaLogs.id })
      .from(slaLogs)
      .where(
        and(
          eq(slaLogs.tenant_id, tenantId),
          eq(slaLogs.entity_type, 'opportunity'),
          eq(slaLogs.entity_id, opportunityId),
          eq(slaLogs.sla_label, 'opp.stage_response'),
          isNull(slaLogs.completed_at)
        )
      )
      .limit(1)
    if (open) return
    await transaction.insert(slaLogs).values({
      tenant_id: tenantId,
      entity_type: 'opportunity',
      entity_id: opportunityId,
      sla_label: 'opp.stage_response',
      sla_seconds: OPP_STAGE_SLA,
    })
  }

  private async claimRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    opportunityId: string,
    idempotencyKey: string,
    requestHash: string,
    fromStage: OpportunityStage,
    toStage: OpportunityStage
  ): Promise<StageRequestRecord> {
    await transaction
      .insert(opportunityStageTransitionRequests)
      .values({
        tenant_id: principal.tenantId,
        opportunity_id: opportunityId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        from_stage: fromStage,
        to_stage: toStage,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          opportunityStageTransitionRequests.tenant_id,
          opportunityStageTransitionRequests.idempotency_key,
        ],
      })
    const [request] = await transaction
      .select({
        id: opportunityStageTransitionRequests.id,
        requestHash: opportunityStageTransitionRequests.request_hash,
        state: opportunityStageTransitionRequests.state,
        fromStage: opportunityStageTransitionRequests.from_stage,
        toStage: opportunityStageTransitionRequests.to_stage,
        result: opportunityStageTransitionRequests.result,
      })
      .from(opportunityStageTransitionRequests)
      .where(
        and(
          eq(opportunityStageTransitionRequests.tenant_id, principal.tenantId),
          eq(opportunityStageTransitionRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Opportunity stage transition idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different Opportunity command'
      )
    }
    return request as StageRequestRecord
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: OpportunityStageTransitionResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(opportunityStageTransitionRequests)
      .set({
        state: 'succeeded',
        project_id: result.projectId,
        checklist_id: result.checklistId,
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
        'Opportunity stage transition idempotency record changed before completion'
      )
    }
  }
}
