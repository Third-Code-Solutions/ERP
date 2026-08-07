import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { GroundedAnswerResult } from '@third-code-erp/ai'
import {
  cortexAssistantGenerationWorkerCompletionSchema,
  cortexAssistantProviderSettlementCommandSchema,
} from '@third-code-erp/shared-types'
import type { ClaimedCortexAssistantGenerationJob } from './cortex-assistant-generation.state'
import {
  CortexAssistantProviderAdapter,
  CortexAssistantProviderAdapterError,
  type CortexAssistantProviderDispatchResult,
} from './cortex-assistant-provider.adapter'
import {
  CortexAssistantProviderBudgetError,
  CortexAssistantProviderBudgetService,
  type CortexAssistantProviderBudgetErrorCode,
} from './cortex-assistant-provider-budget.service'

export type CortexAssistantProviderExecutionErrorCode =
  | CortexAssistantProviderBudgetErrorCode
  | 'provider_execution_disabled'
  | 'provider_adapter_unavailable'
  | 'provider_dispatch_replay'
  | 'provider_attempt_terminal'
  | 'provider_request_failed'
  | 'provider_response_invalid'
  | 'provider_outcome_unknown'
  | 'provider_reconciliation_failed'

export class CortexAssistantProviderExecutionError extends Error {
  constructor(
    readonly code: CortexAssistantProviderExecutionErrorCode,
    readonly retryable: boolean
  ) {
    super(code)
    this.name = 'CortexAssistantProviderExecutionError'
  }
}

/**
 * Provider-neutral orchestration. Default adapter cannot dispatch. Tests use
 * an in-memory fake to prove cost and fencing behavior without network access.
 */
@Injectable()
export class CortexAssistantProviderExecutionService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(CortexAssistantProviderBudgetService)
    private readonly budget: CortexAssistantProviderBudgetService,
    @Inject(CortexAssistantProviderAdapter)
    private readonly adapter: CortexAssistantProviderAdapter
  ) {}

  enabledForTenant(tenantId: string): boolean {
    return (
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED',
        false
      ) === true &&
      this.config
        .get<string[]>(
          'ERP_CORTEX_ASSISTANT_GENERATION_JOBS_TENANT_IDS',
          []
        )
        .includes(tenantId) &&
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_ENABLED',
        false
      ) === true &&
      this.config
        .get<string[]>(
          'ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_TENANT_IDS',
          []
        )
        .includes(tenantId) &&
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_ENABLED',
        false
      ) === true &&
      this.config
        .get<string[]>(
          'ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_TENANT_IDS',
          []
        )
        .includes(tenantId)
    )
  }

  async generate(
    claimed: ClaimedCortexAssistantGenerationJob
  ): Promise<GroundedAnswerResult> {
    if (!this.enabledForTenant(claimed.tenantId)) {
      throw new CortexAssistantProviderExecutionError(
        'provider_execution_disabled',
        false
      )
    }
    const plan = this.adapter.plan()
    if (!plan) {
      throw new CortexAssistantProviderExecutionError(
        'provider_adapter_unavailable',
        false
      )
    }

    await this.budget.reconcileSupersededAttempts(
      claimed.jobId,
      claimed.attemptNumber
    )

    let reservation
    try {
      reservation = await this.budget.reserve({
        jobId: claimed.jobId,
        attemptNumber: claimed.attemptNumber,
        provider: plan.provider,
        model: plan.model,
        maxCostMicros: plan.maxCostMicros,
      })
    } catch (error) {
      throw this.mapBudgetError(error)
    }

    if (reservation.status === 'dispatched') {
      await this.reconcileAttempt(reservation.reservationId, 'replayed')
      throw new CortexAssistantProviderExecutionError(
        'provider_dispatch_replay',
        false
      )
    }
    if (reservation.status !== 'reserved') {
      throw new CortexAssistantProviderExecutionError(
        'provider_attempt_terminal',
        false
      )
    }

    try {
      const dispatched = await this.budget.markDispatched({
        reservationId: reservation.reservationId,
      })
      if (dispatched.replayed) {
        await this.reconcileAttempt(reservation.reservationId, 'replayed')
        throw new CortexAssistantProviderExecutionError(
          'provider_dispatch_replay',
          false
        )
      }

      const output = await this.adapter.dispatch({
        jobId: claimed.jobId,
        attemptNumber: claimed.attemptNumber,
        question: claimed.question,
        evidence: claimed.evidence,
        plan,
      })
      const completion = this.validateOutput(output, claimed)
      const settlement = cortexAssistantProviderSettlementCommandSchema.parse({
        reservationId: reservation.reservationId,
        consumedCostMicros: output.consumedCostMicros,
        outcomeCode: 'provider_succeeded',
      })
      await this.budget.settle(settlement)
      return completion
    } catch (error) {
      if (
        error instanceof CortexAssistantProviderExecutionError &&
        error.code === 'provider_dispatch_replay'
      ) {
        throw error
      }
      await this.reconcileAttempt(reservation.reservationId, 'execution_failed')
      if (error instanceof CortexAssistantProviderAdapterError) {
        throw new CortexAssistantProviderExecutionError(
          error.code,
          error.retryable
        )
      }
      if (error instanceof CortexAssistantProviderBudgetError) {
        throw this.mapBudgetError(error)
      }
      throw new CortexAssistantProviderExecutionError(
        'provider_outcome_unknown',
        true
      )
    }
  }

  private validateOutput(
    output: CortexAssistantProviderDispatchResult,
    claimed: ClaimedCortexAssistantGenerationJob
  ): GroundedAnswerResult {
    let completion: GroundedAnswerResult
    try {
      completion = cortexAssistantGenerationWorkerCompletionSchema.parse({
        content: output.content,
        citationNodeIds: output.citationNodeIds,
        model: output.model,
      })
    } catch {
      throw new CortexAssistantProviderAdapterError(
        'provider_response_invalid',
        false
      )
    }
    const allowedNodeIds = new Set(claimed.evidence.map((item) => item.nodeId))
    if (completion.citationNodeIds.some((id) => !allowedNodeIds.has(id))) {
      throw new CortexAssistantProviderAdapterError(
        'provider_response_invalid',
        false
      )
    }
    return completion
  }

  private async reconcileAttempt(
    reservationId: string,
    reason: 'execution_failed' | 'replayed'
  ): Promise<void> {
    try {
      await this.budget.reconcileAttempt(reservationId, reason)
    } catch {
      throw new CortexAssistantProviderExecutionError(
        'provider_reconciliation_failed',
        true
      )
    }
  }

  private mapBudgetError(error: unknown): CortexAssistantProviderExecutionError {
    if (error instanceof CortexAssistantProviderBudgetError) {
      return new CortexAssistantProviderExecutionError(error.code, false)
    }
    return new CortexAssistantProviderExecutionError(
      'provider_reconciliation_failed',
      true
    )
  }
}
