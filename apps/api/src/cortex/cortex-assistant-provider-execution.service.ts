import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  cortexAssistantProviderPlanSchema,
  cortexAssistantProviderResponseSchema,
  cortexAssistantProviderSettlementCommandSchema,
  type CortexAssistantProviderPlan,
  type CortexAssistantProviderRequest,
  type CortexAssistantProviderResponse,
} from '@third-code-erp/shared-types'
import type { ClaimedCortexAssistantGenerationJob } from './cortex-assistant-generation.state'
import { cortexAssistantGenerationCompletionHash } from './cortex-assistant-generation-completion'
import {
  CortexAssistantProviderAdapter,
  CortexAssistantProviderAdapterError,
} from './cortex-assistant-provider.adapter'
import {
  CortexAssistantProviderBudgetError,
  CortexAssistantProviderBudgetService,
  type CortexAssistantProviderBudgetErrorCode,
  type CortexAssistantProviderReconciliationReason,
} from './cortex-assistant-provider-budget.service'
import {
  buildCortexAssistantProviderRequest,
  cortexAssistantProviderRequestFingerprint,
  cortexAssistantProviderRequestIdHash,
} from './cortex-assistant-provider-protocol'

export type CortexAssistantProviderExecutionErrorCode =
  | CortexAssistantProviderBudgetErrorCode
  | 'provider_execution_disabled'
  | 'provider_adapter_unavailable'
  | 'provider_plan_invalid'
  | 'provider_dispatch_replay'
  | 'provider_attempt_terminal'
  | 'provider_request_timeout'
  | 'provider_rate_limited'
  | 'provider_request_rejected'
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

export interface CortexAssistantProviderExecutionResult {
  providerAttemptId: string
  content: string
  citationNodeIds: string[]
  model: string
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
  ): Promise<CortexAssistantProviderExecutionResult> {
    if (!this.enabledForTenant(claimed.tenantId)) {
      throw new CortexAssistantProviderExecutionError(
        'provider_execution_disabled',
        false
      )
    }
    const rawPlan = this.adapter.plan()
    if (!rawPlan) {
      throw new CortexAssistantProviderExecutionError(
        'provider_adapter_unavailable',
        false
      )
    }
    let plan: CortexAssistantProviderPlan
    try {
      plan = cortexAssistantProviderPlanSchema.parse(rawPlan)
    } catch {
      throw new CortexAssistantProviderExecutionError(
        'provider_plan_invalid',
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

    let request: CortexAssistantProviderRequest
    let requestFingerprint: string
    try {
      request = buildCortexAssistantProviderRequest({
        reservationId: reservation.reservationId,
        plan,
        claimed,
      })
      requestFingerprint = cortexAssistantProviderRequestFingerprint(request)
    } catch {
      await this.reconcileAttempt(
        reservation.reservationId,
        'provider_request_rejected'
      )
      throw new CortexAssistantProviderExecutionError(
        'provider_request_rejected',
        false
      )
    }

    try {
      const dispatched = await this.budget.markDispatched({
        reservationId: reservation.reservationId,
        protocolVersion: 1,
        dispatchKey: request.dispatchKey,
        requestFingerprint,
      })
      if (dispatched.replayed) {
        await this.reconcileAttempt(reservation.reservationId, 'replayed')
        throw new CortexAssistantProviderExecutionError(
          'provider_dispatch_replay',
          false
        )
      }

      const output = await this.dispatchWithinTimeout(request)
      const completion = this.validateOutput(output, request, claimed)
      const responseFingerprint = cortexAssistantGenerationCompletionHash({
        jobId: claimed.jobId,
        requestId: claimed.requestId,
        completion: {
          outcome: 'provider_grounded',
          providerAttemptId: reservation.reservationId,
          ...completion,
        },
      })
      const settlement = cortexAssistantProviderSettlementCommandSchema.parse({
        reservationId: reservation.reservationId,
        protocolVersion: 1,
        consumedCostMicros: output.consumedCostMicros,
        outcomeCode: 'provider_succeeded',
        providerRequestIdHash: cortexAssistantProviderRequestIdHash(
          output.providerRequestId
        ),
        responseFingerprint,
      })
      await this.budget.settle(settlement)
      return {
        ...completion,
        providerAttemptId: reservation.reservationId,
      }
    } catch (error) {
      if (
        error instanceof CortexAssistantProviderExecutionError &&
        error.code === 'provider_dispatch_replay'
      ) {
        throw error
      }
      const reconciliationReason =
        error instanceof CortexAssistantProviderAdapterError
          ? this.providerFailureReason(error.code)
          : error instanceof CortexAssistantProviderBudgetError
            ? 'execution_failed'
            : 'provider_outcome_unknown'
      await this.reconcileAttempt(
        reservation.reservationId,
        reconciliationReason
      )
      if (error instanceof CortexAssistantProviderAdapterError) {
        throw new CortexAssistantProviderExecutionError(
          error.code,
          false
        )
      }
      if (error instanceof CortexAssistantProviderBudgetError) {
        throw this.mapBudgetError(error)
      }
      throw new CortexAssistantProviderExecutionError(
        'provider_outcome_unknown',
        false
      )
    }
  }

  private validateOutput(
    output: CortexAssistantProviderResponse,
    request: CortexAssistantProviderRequest,
    claimed: ClaimedCortexAssistantGenerationJob
  ): { content: string; citationNodeIds: string[]; model: string } {
    let parsed: CortexAssistantProviderResponse
    try {
      parsed = cortexAssistantProviderResponseSchema.parse(output)
    } catch {
      throw new CortexAssistantProviderAdapterError('provider_response_invalid')
    }
    if (parsed.model !== request.model) {
      throw new CortexAssistantProviderAdapterError('provider_response_invalid')
    }
    const allowedNodeIds = new Set(claimed.evidence.map((item) => item.nodeId))
    if (parsed.citationNodeIds.some((id) => !allowedNodeIds.has(id))) {
      throw new CortexAssistantProviderAdapterError('provider_response_invalid')
    }
    return {
      content: parsed.content,
      citationNodeIds: parsed.citationNodeIds,
      model: parsed.model,
    }
  }

  private async dispatchWithinTimeout(
    request: CortexAssistantProviderRequest
  ): Promise<CortexAssistantProviderResponse> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(
          new CortexAssistantProviderAdapterError('provider_request_timeout')
        )
      }, request.timeoutMs)
      timer.unref()
    })
    try {
      return await Promise.race([
        this.adapter.dispatch(request, controller.signal),
        timeout,
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private async reconcileAttempt(
    reservationId: string,
    reason: CortexAssistantProviderReconciliationReason
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

  private providerFailureReason(
    code: CortexAssistantProviderAdapterError['code']
  ): CortexAssistantProviderReconciliationReason {
    switch (code) {
      case 'provider_request_rejected':
      case 'provider_request_timeout':
      case 'provider_rate_limited':
      case 'provider_request_failed':
      case 'provider_response_invalid':
      case 'provider_outcome_unknown':
        return code
      default:
        return 'provider_outcome_unknown'
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
