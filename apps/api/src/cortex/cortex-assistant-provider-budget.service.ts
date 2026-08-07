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
import { and, eq, sql } from 'drizzle-orm'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

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
  status: string
  reservedCostMicros: number
  consumedCostMicros: number | null
  outcomeCode: string | null
  budgetDate: string
  provider: string
  model: string
  policyEnabled: boolean
  userId: string
  jobStatus: string
  jobAttemptCount: number
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
    private readonly audit: AuditService
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
      if (attempt.status === 'dispatched') return this.toResult(attempt, true)
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

      const now = new Date()
      const [updated] = await transaction
        .update(cortexAssistantProviderAttempts)
        .set({ status: 'dispatched', dispatched_at: now, updated_at: now })
        .where(
          and(
            eq(cortexAssistantProviderAttempts.id, attempt.id),
            eq(cortexAssistantProviderAttempts.status, 'reserved')
          )
        )
        .returning({ id: cortexAssistantProviderAttempts.id })
      if (!updated) this.fail('provider_attempt_state_conflict')

      await this.writeStateAudit(transaction, attempt, 'dispatched')
      return this.toResult({ ...attempt, status: 'dispatched' }, false)
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
          attempt.outcomeCode !== command.outcomeCode
        ) {
          this.fail('provider_attempt_changed')
        }
        return this.toResult(attempt, true)
      }
      if (attempt.status !== 'dispatched') {
        this.fail('provider_attempt_state_conflict')
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
      }
      await this.writeStateAudit(transaction, settled, 'settled')
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
      userId: cortexAssistantGenerationJobs.user_id,
      jobStatus: cortexAssistantGenerationJobs.status,
      jobAttemptCount: cortexAssistantGenerationJobs.attempt_count,
    }
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
