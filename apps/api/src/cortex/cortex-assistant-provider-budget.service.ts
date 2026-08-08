import { createHash } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  cortexAssistantGenerationJobs,
  cortexAssistantProviderAttempts,
  cortexAssistantProviderPolicies,
} from '@third-code-erp/database'
import {
  cortexAssistantProviderAttemptResultSchema,
  cortexAssistantProviderAttemptIdentitySchema,
  cortexAssistantProviderDispatchCommandSchema,
  cortexAssistantProviderReleaseCommandSchema,
  cortexAssistantProviderReservationCommandSchema,
  cortexAssistantProviderSettlementCommandSchema,
  type CortexAssistantProviderAttemptResult,
  type CortexAssistantProviderDispatchCommand,
  type CortexAssistantProviderReleaseCommand,
  type CortexAssistantProviderReservationCommand,
  type CortexAssistantProviderSettlementCommand,
} from '@third-code-erp/shared-types'
import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import { cortexAssistantProviderDispatchKey } from './cortex-assistant-provider-protocol'
import { readCortexAssistantProviderCircuit } from './cortex-assistant-provider-health.query'
import { CortexAssistantProviderCircuitAlertService } from './cortex-assistant-provider-circuit-alert.service'

export type CortexAssistantProviderBudgetErrorCode =
  | 'provider_budget_disabled'
  | 'provider_budget_policy_unavailable'
  | 'provider_request_budget_exceeded'
  | 'provider_daily_budget_exceeded'
  | 'provider_attempt_not_found'
  | 'provider_attempt_not_claimed'
  | 'provider_attempt_changed'
  | 'provider_attempt_state_conflict'
  | 'provider_settlement_budget_exceeded'
  | 'provider_circuit_open'
  | 'provider_circuit_probe_in_progress'

export class CortexAssistantProviderBudgetError extends Error {
  constructor(readonly code: CortexAssistantProviderBudgetErrorCode) {
    super(code)
    this.name = 'CortexAssistantProviderBudgetError'
  }
}

interface ProviderAttemptRow {
  id: string
  tenantId: string
  policyId: string
  jobId: string
  attemptNumber: number
  requestHash: string
  protocolVersion: number | null
  dispatchKey: string | null
  requestFingerprint: string | null
  providerRequestIdHash: string | null
  responseFingerprint: string | null
  status: string
  reservedCostMicros: number
  consumedCostMicros: number | null
  outcomeCode: string | null
  budgetDate: string
  provider: string
  model: string
  policyEnabled: boolean
  circuitFailureThreshold: number
  circuitFailureWindowSeconds: number
  circuitCooldownSeconds: number
  userId: string
  jobStatus: string
  jobAttemptCount: number
}

interface ProviderClockRow extends Record<string, unknown> {
  now: string
}

function parseProviderClock(value: string): Date {
  const now = new Date(value)
  if (!Number.isFinite(now.getTime())) {
    throw new Error('Provider circuit clock is invalid')
  }
  return now
}

export type CortexAssistantProviderReconciliationReason =
  | 'cancelled'
  | 'retry'
  | 'failed'
  | 'recovered'
  | 'superseded'
  | 'execution_failed'
  | 'replayed'
  | 'provider_request_rejected'
  | 'provider_request_timeout'
  | 'provider_rate_limited'
  | 'provider_request_failed'
  | 'provider_response_invalid'
  | 'provider_outcome_unknown'

const RECONCILIATION_OUTCOMES: Record<
  CortexAssistantProviderReconciliationReason,
  { reserved: string; dispatched: string }
> = {
  cancelled: {
    reserved: 'cancelled_before_dispatch',
    dispatched: 'cancelled_outcome_unknown',
  },
  retry: {
    reserved: 'retry_before_dispatch',
    dispatched: 'retry_outcome_unknown',
  },
  failed: {
    reserved: 'failed_before_dispatch',
    dispatched: 'failed_outcome_unknown',
  },
  recovered: {
    reserved: 'recovered_before_dispatch',
    dispatched: 'recovered_outcome_unknown',
  },
  superseded: {
    reserved: 'superseded_before_dispatch',
    dispatched: 'superseded_outcome_unknown',
  },
  execution_failed: {
    reserved: 'execution_failed_before_dispatch',
    dispatched: 'execution_failed_outcome_unknown',
  },
  replayed: {
    reserved: 'replayed_before_dispatch',
    dispatched: 'replayed_outcome_unknown',
  },
  provider_request_rejected: {
    reserved: 'provider_error:request_rejected_before_dispatch',
    dispatched: 'provider_error:request_rejected',
  },
  provider_request_timeout: {
    reserved: 'provider_error:timeout_before_dispatch',
    dispatched: 'provider_error:timeout',
  },
  provider_rate_limited: {
    reserved: 'provider_error:rate_limited_before_dispatch',
    dispatched: 'provider_error:rate_limited',
  },
  provider_request_failed: {
    reserved: 'provider_error:request_failed_before_dispatch',
    dispatched: 'provider_error:request_failed',
  },
  provider_response_invalid: {
    reserved: 'provider_error:response_invalid_before_dispatch',
    dispatched: 'provider_error:response_invalid',
  },
  provider_outcome_unknown: {
    reserved: 'provider_error:outcome_unknown_before_dispatch',
    dispatched: 'provider_error:outcome_unknown',
  },
}

export function cortexAssistantProviderReservationHash(
  command: CortexAssistantProviderReservationCommand
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        command.jobId,
        command.attemptNumber,
        command.provider,
        command.model,
        command.maxCostMicros,
      ]),
      'utf8'
    )
    .digest('hex')
}

/**
 * PostgreSQL money authority for a future provider-backed assistant worker.
 * This service has no controller and never invokes a provider or Python.
 */
@Injectable()
export class CortexAssistantProviderBudgetService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(AuditService)
    private readonly audit: AuditService,
    @Inject(CortexAssistantProviderCircuitAlertService)
    private readonly circuitAlerts: CortexAssistantProviderCircuitAlertService
  ) {}

  async reserve(
    input: CortexAssistantProviderReservationCommand
  ): Promise<CortexAssistantProviderAttemptResult> {
    const command = cortexAssistantProviderReservationCommandSchema.parse(input)
    this.assertGlobalReservationGate()
    const requestHash = cortexAssistantProviderReservationHash(command)
    const requestedMicros = Number(command.maxCostMicros)

    return this.database.client.transaction(async (transaction) => {
      const [job] = await transaction
        .select({
          id: cortexAssistantGenerationJobs.id,
          tenantId: cortexAssistantGenerationJobs.tenant_id,
          userId: cortexAssistantGenerationJobs.user_id,
          status: cortexAssistantGenerationJobs.status,
          attemptCount: cortexAssistantGenerationJobs.attempt_count,
        })
        .from(cortexAssistantGenerationJobs)
        .where(eq(cortexAssistantGenerationJobs.id, command.jobId))
        .limit(1)
        .for('update')
      if (!job) this.fail('provider_attempt_not_claimed')
      this.assertTenantReservationGate(job.tenantId)

      const existing = await this.findAttemptForJob(
        transaction,
        job.tenantId,
        command.jobId,
        command.attemptNumber
      )
      if (existing) {
        if (existing.requestHash !== requestHash) {
          this.fail('provider_attempt_changed')
        }
        return this.toResult(existing, true)
      }

      if (
        job.status !== 'processing' ||
        job.attemptCount !== command.attemptNumber
      ) {
        this.fail('provider_attempt_not_claimed')
      }

      const [policy] = await transaction
        .select({
          id: cortexAssistantProviderPolicies.id,
          enabled: cortexAssistantProviderPolicies.enabled,
          requestLimitMicros:
            cortexAssistantProviderPolicies.request_limit_micros,
          dailyLimitMicros: cortexAssistantProviderPolicies.daily_limit_micros,
          failureThreshold:
            cortexAssistantProviderPolicies.circuit_failure_threshold,
          failureWindowSeconds:
            cortexAssistantProviderPolicies.circuit_failure_window_seconds,
          cooldownSeconds:
            cortexAssistantProviderPolicies.circuit_cooldown_seconds,
        })
        .from(cortexAssistantProviderPolicies)
        .where(
          and(
            eq(cortexAssistantProviderPolicies.tenant_id, job.tenantId),
            eq(cortexAssistantProviderPolicies.provider, command.provider),
            eq(cortexAssistantProviderPolicies.model, command.model)
          )
        )
        .limit(1)
        .for('update')
      if (!policy?.enabled) this.fail('provider_budget_policy_unavailable')
      const [clock] = await transaction.execute<ProviderClockRow>(sql`
        select transaction_timestamp()::text as now
      `)
      if (!clock?.now) throw new Error('Provider circuit clock unavailable')
      const circuit = await readCortexAssistantProviderCircuit(
        transaction,
        { ...policy, tenantId: job.tenantId },
        parseProviderClock(clock.now)
      )
      if (circuit.state === 'open') this.fail('provider_circuit_open')
      if (circuit.state === 'half_open' && circuit.probeInFlight) {
        this.fail('provider_circuit_probe_in_progress')
      }
      if (requestedMicros > policy.requestLimitMicros) {
        this.fail('provider_request_budget_exceeded')
      }

      const [usage] = await transaction
        .select({
          usedMicros: sql<string>`coalesce(sum(
            case
              when ${cortexAssistantProviderAttempts.status}
                in ('reserved', 'dispatched')
                then ${cortexAssistantProviderAttempts.reserved_cost_micros}
              when ${cortexAssistantProviderAttempts.status} = 'settled'
                then ${cortexAssistantProviderAttempts.consumed_cost_micros}
              else 0
            end
          ), 0)::text`,
        })
        .from(cortexAssistantProviderAttempts)
        .where(
          and(
            eq(cortexAssistantProviderAttempts.tenant_id, job.tenantId),
            eq(cortexAssistantProviderAttempts.policy_id, policy.id),
            eq(
              cortexAssistantProviderAttempts.budget_date,
              sql`(pg_catalog.timezone('UTC', transaction_timestamp()))::date`
            )
          )
        )
      const usedMicros = Number(usage?.usedMicros ?? '0')
      if (
        !Number.isSafeInteger(usedMicros) ||
        usedMicros < 0 ||
        requestedMicros > policy.dailyLimitMicros - usedMicros
      ) {
        this.fail('provider_daily_budget_exceeded')
      }

      const [created] = await transaction
        .insert(cortexAssistantProviderAttempts)
        .values({
          tenant_id: job.tenantId,
          policy_id: policy.id,
          job_id: job.id,
          attempt_number: command.attemptNumber,
          request_hash: requestHash,
          reserved_cost_micros: requestedMicros,
        })
        .returning({
          id: cortexAssistantProviderAttempts.id,
          status: cortexAssistantProviderAttempts.status,
          budgetDate: cortexAssistantProviderAttempts.budget_date,
        })
      if (!created) throw new Error('Provider reservation was not created')

      await this.audit.writeSemantic(transaction, {
        tenantId: job.tenantId,
        actorId: job.userId,
        entityType: 'cortex_assistant_provider_attempt',
        entityId: created.id,
        action: 'create',
        diff: {
          assistant_generation_job_id: job.id,
          attempt_number: command.attemptNumber,
          provider: command.provider,
          model: command.model,
          provider_attempt_state: 'reserved',
          reserved_cost_micros: command.maxCostMicros,
        },
      })

      return cortexAssistantProviderAttemptResultSchema.parse({
        reservationId: created.id,
        jobId: job.id,
        attemptNumber: command.attemptNumber,
        provider: command.provider,
        model: command.model,
        status: created.status,
        reservedCostMicros: command.maxCostMicros,
        consumedCostMicros: null,
        outcomeCode: null,
        budgetDate: created.budgetDate,
        replayed: false,
      })
    })
  }

  async markDispatched(
    input: CortexAssistantProviderDispatchCommand
  ): Promise<CortexAssistantProviderAttemptResult> {
    const command = cortexAssistantProviderDispatchCommandSchema.parse(input)
    this.assertGlobalReservationGate()
    return this.database.client.transaction(async (transaction) => {
      const attempt = await this.findAttempt(transaction, command.reservationId)
      if (!attempt) this.fail('provider_attempt_not_found')
      this.assertTenantReservationGate(attempt.tenantId)
      if (
        command.dispatchKey !==
        cortexAssistantProviderDispatchKey(command.reservationId)
      ) {
        this.fail('provider_attempt_changed')
      }
      if (attempt.status === 'dispatched') {
        if (
          attempt.protocolVersion !== command.protocolVersion ||
          attempt.dispatchKey !== command.dispatchKey ||
          attempt.requestFingerprint !== command.requestFingerprint
        ) {
          this.fail('provider_attempt_changed')
        }
        return this.toResult(attempt, true)
      }
      if (!attempt.policyEnabled) {
        this.fail('provider_budget_policy_unavailable')
      }
      if (
        attempt.status !== 'reserved' ||
        attempt.jobStatus !== 'processing' ||
        attempt.jobAttemptCount !== attempt.attemptNumber
      ) {
        this.fail('provider_attempt_state_conflict')
      }

      const [clock] = await transaction.execute<ProviderClockRow>(sql`
        select transaction_timestamp()::text as now
      `)
      if (!clock?.now) throw new Error('Provider circuit clock unavailable')
      const circuit = await readCortexAssistantProviderCircuit(
        transaction,
        {
          id: attempt.policyId,
          tenantId: attempt.tenantId,
          failureThreshold: attempt.circuitFailureThreshold,
          failureWindowSeconds: attempt.circuitFailureWindowSeconds,
          cooldownSeconds: attempt.circuitCooldownSeconds,
        },
        parseProviderClock(clock.now)
      )
      if (
        circuit.state !== 'closed' &&
        circuit.probeAttemptId !== attempt.id
      ) {
        this.fail('provider_circuit_open')
      }

      const now = new Date()
      const [updated] = await transaction
        .update(cortexAssistantProviderAttempts)
        .set({
          status: 'dispatched',
          protocol_version: command.protocolVersion,
          dispatch_key: command.dispatchKey,
          request_fingerprint: command.requestFingerprint,
          dispatched_at: now,
          updated_at: now,
        })
        .where(
          and(
            eq(cortexAssistantProviderAttempts.id, attempt.id),
            eq(cortexAssistantProviderAttempts.status, 'reserved')
          )
        )
        .returning({ id: cortexAssistantProviderAttempts.id })
      if (!updated) this.fail('provider_attempt_state_conflict')

      const dispatched = {
        ...attempt,
        status: 'dispatched',
        protocolVersion: command.protocolVersion,
        dispatchKey: command.dispatchKey,
        requestFingerprint: command.requestFingerprint,
      }
      await this.writeStateAudit(transaction, dispatched, 'dispatched')
      return this.toResult(dispatched, false)
    })
  }

  async settle(
    input: CortexAssistantProviderSettlementCommand
  ): Promise<CortexAssistantProviderAttemptResult> {
    const command = cortexAssistantProviderSettlementCommandSchema.parse(input)
    const consumedMicros = Number(command.consumedCostMicros)
    return this.database.client.transaction(async (transaction) => {
      const attempt = await this.findAttempt(transaction, command.reservationId)
      if (!attempt) this.fail('provider_attempt_not_found')
      if (attempt.status === 'settled') {
        if (
          attempt.consumedCostMicros !== consumedMicros ||
          attempt.outcomeCode !== command.outcomeCode ||
          attempt.protocolVersion !== command.protocolVersion ||
          attempt.providerRequestIdHash !== command.providerRequestIdHash ||
          attempt.responseFingerprint !== command.responseFingerprint
        ) {
          this.fail('provider_attempt_changed')
        }
        return this.toResult(attempt, true)
      }
      if (attempt.status !== 'dispatched') {
        this.fail('provider_attempt_state_conflict')
      }
      if (
        attempt.protocolVersion !== command.protocolVersion ||
        !attempt.dispatchKey ||
        !attempt.requestFingerprint
      ) {
        this.fail('provider_attempt_changed')
      }
      if (consumedMicros > attempt.reservedCostMicros) {
        this.fail('provider_settlement_budget_exceeded')
      }

      const now = new Date()
      const [updated] = await transaction
        .update(cortexAssistantProviderAttempts)
        .set({
          status: 'settled',
          consumed_cost_micros: consumedMicros,
          outcome_code: command.outcomeCode,
          provider_request_id_hash: command.providerRequestIdHash,
          response_fingerprint: command.responseFingerprint,
          terminal_at: now,
          updated_at: now,
        })
        .where(
          and(
            eq(cortexAssistantProviderAttempts.id, attempt.id),
            eq(cortexAssistantProviderAttempts.status, 'dispatched')
          )
        )
        .returning({ id: cortexAssistantProviderAttempts.id })
      if (!updated) this.fail('provider_attempt_state_conflict')

      const settled = {
        ...attempt,
        status: 'settled',
        consumedCostMicros: consumedMicros,
        outcomeCode: command.outcomeCode,
        providerRequestIdHash: command.providerRequestIdHash,
        responseFingerprint: command.responseFingerprint,
      }
      await this.writeStateAudit(transaction, settled, 'settled')
      await this.observeCircuit(transaction, settled, now)
      return this.toResult(settled, false)
    })
  }

  async release(
    input: CortexAssistantProviderReleaseCommand
  ): Promise<CortexAssistantProviderAttemptResult> {
    const command = cortexAssistantProviderReleaseCommandSchema.parse(input)
    return this.database.client.transaction(async (transaction) => {
      const attempt = await this.findAttempt(transaction, command.reservationId)
      if (!attempt) this.fail('provider_attempt_not_found')
      if (attempt.status === 'released') {
        if (attempt.outcomeCode !== command.outcomeCode) {
          this.fail('provider_attempt_changed')
        }
        return this.toResult(attempt, true)
      }
      if (attempt.status !== 'reserved') {
        this.fail('provider_attempt_state_conflict')
      }

      const now = new Date()
      const [updated] = await transaction
        .update(cortexAssistantProviderAttempts)
        .set({
          status: 'released',
          consumed_cost_micros: 0,
          outcome_code: command.outcomeCode,
          terminal_at: now,
          updated_at: now,
        })
        .where(
          and(
            eq(cortexAssistantProviderAttempts.id, attempt.id),
            eq(cortexAssistantProviderAttempts.status, 'reserved')
          )
        )
        .returning({ id: cortexAssistantProviderAttempts.id })
      if (!updated) this.fail('provider_attempt_state_conflict')

      const released = {
        ...attempt,
        status: 'released',
        consumedCostMicros: 0,
        outcomeCode: command.outcomeCode,
      }
      await this.writeStateAudit(transaction, released, 'released')
      return this.toResult(released, false)
    })
  }

  async reconcileAttempt(
    reservationId: string,
    reason: CortexAssistantProviderReconciliationReason
  ): Promise<number> {
    const command = cortexAssistantProviderAttemptIdentitySchema.parse({
      reservationId,
    })
    return this.database.client.transaction(async (transaction) => {
      const [identity] = await transaction
        .select({ jobId: cortexAssistantProviderAttempts.job_id })
        .from(cortexAssistantProviderAttempts)
        .where(eq(cortexAssistantProviderAttempts.id, command.reservationId))
        .limit(1)
      if (!identity) return 0
      const [job] = await transaction
        .select({ id: cortexAssistantGenerationJobs.id })
        .from(cortexAssistantGenerationJobs)
        .where(eq(cortexAssistantGenerationJobs.id, identity.jobId))
        .limit(1)
        .for('update')
      if (!job) return 0
      return this.reconcileOpenAttemptsWithin(transaction, job.id, reason, {
        reservationId: command.reservationId,
      })
    })
  }

  async reconcileSupersededAttempts(
    jobId: string,
    currentAttemptNumber: number
  ): Promise<number> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        jobId
      ) ||
      !Number.isInteger(currentAttemptNumber) ||
      currentAttemptNumber < 1 ||
      currentAttemptNumber > 3
    ) {
      throw new Error('Invalid provider reconciliation scope')
    }
    return this.database.client.transaction(async (transaction) => {
      const [job] = await transaction
        .select({ id: cortexAssistantGenerationJobs.id })
        .from(cortexAssistantGenerationJobs)
        .where(eq(cortexAssistantGenerationJobs.id, jobId))
        .limit(1)
        .for('update')
      if (!job) return 0
      return this.reconcileOpenAttemptsWithin(
        transaction,
        job.id,
        'superseded',
        { maxAttemptExclusive: currentAttemptNumber }
      )
    })
  }

  async reconcileGenerationJobWithin(
    transaction: DatabaseTransaction,
    jobId: string,
    reason: 'cancelled' | 'retry' | 'failed' | 'recovered'
  ): Promise<number> {
    return this.reconcileOpenAttemptsWithin(transaction, jobId, reason)
  }

  private async findAttempt(
    transaction: DatabaseTransaction,
    reservationId: string
  ): Promise<ProviderAttemptRow | null> {
    const [row] = await transaction
      .select(this.attemptSelection())
      .from(cortexAssistantProviderAttempts)
      .innerJoin(
        cortexAssistantProviderPolicies,
        and(
          eq(
            cortexAssistantProviderPolicies.id,
            cortexAssistantProviderAttempts.policy_id
          ),
          eq(
            cortexAssistantProviderPolicies.tenant_id,
            cortexAssistantProviderAttempts.tenant_id
          )
        )
      )
      .innerJoin(
        cortexAssistantGenerationJobs,
        and(
          eq(
            cortexAssistantGenerationJobs.id,
            cortexAssistantProviderAttempts.job_id
          ),
          eq(
            cortexAssistantGenerationJobs.tenant_id,
            cortexAssistantProviderAttempts.tenant_id
          )
        )
      )
      .where(eq(cortexAssistantProviderAttempts.id, reservationId))
      .limit(1)
      .for('update')
    return row ?? null
  }

  private async findAttemptForJob(
    transaction: DatabaseTransaction,
    tenantId: string,
    jobId: string,
    attemptNumber: number
  ): Promise<ProviderAttemptRow | null> {
    const [row] = await transaction
      .select(this.attemptSelection())
      .from(cortexAssistantProviderAttempts)
      .innerJoin(
        cortexAssistantProviderPolicies,
        and(
          eq(
            cortexAssistantProviderPolicies.id,
            cortexAssistantProviderAttempts.policy_id
          ),
          eq(cortexAssistantProviderPolicies.tenant_id, tenantId)
        )
      )
      .innerJoin(
        cortexAssistantGenerationJobs,
        and(
          eq(cortexAssistantGenerationJobs.id, jobId),
          eq(cortexAssistantGenerationJobs.tenant_id, tenantId)
        )
      )
      .where(
        and(
          eq(cortexAssistantProviderAttempts.tenant_id, tenantId),
          eq(cortexAssistantProviderAttempts.job_id, jobId),
          eq(cortexAssistantProviderAttempts.attempt_number, attemptNumber)
        )
      )
      .limit(1)
      .for('update')
    return row ?? null
  }

  private attemptSelection() {
    return {
      id: cortexAssistantProviderAttempts.id,
      tenantId: cortexAssistantProviderAttempts.tenant_id,
      policyId: cortexAssistantProviderAttempts.policy_id,
      jobId: cortexAssistantProviderAttempts.job_id,
      attemptNumber: cortexAssistantProviderAttempts.attempt_number,
      requestHash: cortexAssistantProviderAttempts.request_hash,
      protocolVersion: cortexAssistantProviderAttempts.protocol_version,
      dispatchKey: cortexAssistantProviderAttempts.dispatch_key,
      requestFingerprint: cortexAssistantProviderAttempts.request_fingerprint,
      providerRequestIdHash:
        cortexAssistantProviderAttempts.provider_request_id_hash,
      responseFingerprint:
        cortexAssistantProviderAttempts.response_fingerprint,
      status: cortexAssistantProviderAttempts.status,
      reservedCostMicros:
        cortexAssistantProviderAttempts.reserved_cost_micros,
      consumedCostMicros:
        cortexAssistantProviderAttempts.consumed_cost_micros,
      outcomeCode: cortexAssistantProviderAttempts.outcome_code,
      budgetDate: cortexAssistantProviderAttempts.budget_date,
      provider: cortexAssistantProviderPolicies.provider,
      model: cortexAssistantProviderPolicies.model,
      policyEnabled: cortexAssistantProviderPolicies.enabled,
      circuitFailureThreshold:
        cortexAssistantProviderPolicies.circuit_failure_threshold,
      circuitFailureWindowSeconds:
        cortexAssistantProviderPolicies.circuit_failure_window_seconds,
      circuitCooldownSeconds:
        cortexAssistantProviderPolicies.circuit_cooldown_seconds,
      userId: cortexAssistantGenerationJobs.user_id,
      jobStatus: cortexAssistantGenerationJobs.status,
      jobAttemptCount: cortexAssistantGenerationJobs.attempt_count,
    }
  }

  private async reconcileOpenAttemptsWithin(
    transaction: DatabaseTransaction,
    jobId: string,
    reason: CortexAssistantProviderReconciliationReason,
    scope: {
      reservationId?: string
      maxAttemptExclusive?: number
    } = {}
  ): Promise<number> {
    const conditions = [
      eq(cortexAssistantProviderAttempts.job_id, jobId),
      inArray(cortexAssistantProviderAttempts.status, [
        'reserved',
        'dispatched',
      ]),
    ]
    if (scope.reservationId) {
      conditions.push(
        eq(cortexAssistantProviderAttempts.id, scope.reservationId)
      )
    }
    if (scope.maxAttemptExclusive !== undefined) {
      conditions.push(
        lt(
          cortexAssistantProviderAttempts.attempt_number,
          scope.maxAttemptExclusive
        )
      )
    }
    const attempts = await transaction
      .select(this.attemptSelection())
      .from(cortexAssistantProviderAttempts)
      .innerJoin(
        cortexAssistantProviderPolicies,
        and(
          eq(
            cortexAssistantProviderPolicies.id,
            cortexAssistantProviderAttempts.policy_id
          ),
          eq(
            cortexAssistantProviderPolicies.tenant_id,
            cortexAssistantProviderAttempts.tenant_id
          )
        )
      )
      .innerJoin(
        cortexAssistantGenerationJobs,
        and(
          eq(
            cortexAssistantGenerationJobs.id,
            cortexAssistantProviderAttempts.job_id
          ),
          eq(
            cortexAssistantGenerationJobs.tenant_id,
            cortexAssistantProviderAttempts.tenant_id
          )
        )
      )
      .where(and(...conditions))
      .orderBy(cortexAssistantProviderAttempts.attempt_number)
      .for('update', { of: cortexAssistantProviderAttempts })

    let reconciled = 0
    let latestAttempt: ProviderAttemptRow | null = null
    for (const attempt of attempts) {
      const now = new Date()
      const outcome = RECONCILIATION_OUTCOMES[reason][
        attempt.status as 'reserved' | 'dispatched'
      ]
      const targetState = attempt.status === 'reserved' ? 'released' : 'settled'
      const consumedMicros =
        attempt.status === 'reserved' ? 0 : attempt.reservedCostMicros
      const [updated] = await transaction
        .update(cortexAssistantProviderAttempts)
        .set({
          status: targetState,
          consumed_cost_micros: consumedMicros,
          outcome_code: outcome,
          terminal_at: now,
          updated_at: now,
        })
        .where(
          and(
            eq(cortexAssistantProviderAttempts.id, attempt.id),
            eq(cortexAssistantProviderAttempts.status, attempt.status)
          )
        )
        .returning({ id: cortexAssistantProviderAttempts.id })
      if (!updated) continue
      const terminal = {
        ...attempt,
        status: targetState,
        consumedCostMicros: consumedMicros,
        outcomeCode: outcome,
      }
      await this.writeStateAudit(transaction, terminal, targetState)
      latestAttempt = attempt
      reconciled += 1
    }
    if (latestAttempt) {
      await this.observeCircuit(transaction, latestAttempt, new Date())
    }
    return reconciled
  }

  private async observeCircuit(
    transaction: DatabaseTransaction,
    attempt: ProviderAttemptRow,
    asOf: Date
  ): Promise<void> {
    const [clock] = await transaction.execute<ProviderClockRow>(sql`
      select transaction_timestamp()::text as now
    `)
    if (!clock?.now) throw new Error('Provider circuit clock unavailable')
    const circuit = await readCortexAssistantProviderCircuit(
      transaction,
      {
        id: attempt.policyId,
        tenantId: attempt.tenantId,
        failureThreshold: attempt.circuitFailureThreshold,
        failureWindowSeconds: attempt.circuitFailureWindowSeconds,
        cooldownSeconds: attempt.circuitCooldownSeconds,
      },
      parseProviderClock(clock.now)
    )
    await this.circuitAlerts.observe(
      transaction,
      {
        id: attempt.policyId,
        tenantId: attempt.tenantId,
        provider: attempt.provider,
        model: attempt.model,
        failureThreshold: attempt.circuitFailureThreshold,
        failureWindowSeconds: attempt.circuitFailureWindowSeconds,
        cooldownSeconds: attempt.circuitCooldownSeconds,
      },
      circuit,
      asOf
    )
  }

  private toResult(
    row: ProviderAttemptRow,
    replayed: boolean
  ): CortexAssistantProviderAttemptResult {
    return cortexAssistantProviderAttemptResultSchema.parse({
      reservationId: row.id,
      jobId: row.jobId,
      attemptNumber: row.attemptNumber,
      provider: row.provider,
      model: row.model,
      status: row.status,
      reservedCostMicros: String(row.reservedCostMicros),
      consumedCostMicros:
        row.consumedCostMicros === null
          ? null
          : String(row.consumedCostMicros),
      outcomeCode: row.outcomeCode,
      budgetDate: row.budgetDate,
      replayed,
    })
  }

  private async writeStateAudit(
    transaction: DatabaseTransaction,
    attempt: ProviderAttemptRow,
    state: 'dispatched' | 'settled' | 'released'
  ): Promise<void> {
    await this.audit.writeSemantic(transaction, {
      tenantId: attempt.tenantId,
      actorId: attempt.userId,
      entityType: 'cortex_assistant_provider_attempt',
      entityId: attempt.id,
      action: 'status_change',
      diff: {
        assistant_generation_job_id: attempt.jobId,
        attempt_number: attempt.attemptNumber,
        provider: attempt.provider,
        model: attempt.model,
        provider_attempt_state: state,
        reserved_cost_micros: String(attempt.reservedCostMicros),
        consumed_cost_micros:
          attempt.consumedCostMicros === null
            ? null
            : String(attempt.consumedCostMicros),
        outcome_code: attempt.outcomeCode,
        protocol_version: attempt.protocolVersion,
        dispatch_key: attempt.dispatchKey,
        request_fingerprint: attempt.requestFingerprint,
        provider_request_id_hash: attempt.providerRequestIdHash,
        response_fingerprint: attempt.responseFingerprint,
      },
    })
  }

  private assertGlobalReservationGate(): void {
    if (
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_ENABLED',
        false
      ) !== true
    ) {
      this.fail('provider_budget_disabled')
    }
  }

  private assertTenantReservationGate(tenantId: string): void {
    if (
      !this.config
        .get<string[]>(
          'ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_TENANT_IDS',
          []
        )
        .includes(tenantId)
    ) {
      this.fail('provider_budget_disabled')
    }
  }

  private fail(code: CortexAssistantProviderBudgetErrorCode): never {
    throw new CortexAssistantProviderBudgetError(code)
  }
}
