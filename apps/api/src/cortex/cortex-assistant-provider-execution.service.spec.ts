import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ClaimedCortexAssistantGenerationJob } from './cortex-assistant-generation.state'
import {
  CortexAssistantProviderAdapter,
  CortexAssistantProviderAdapterError,
} from './cortex-assistant-provider.adapter'
import type { CortexAssistantProviderBudgetService } from './cortex-assistant-provider-budget.service'
import {
  CortexAssistantProviderExecutionError,
  CortexAssistantProviderExecutionService,
} from './cortex-assistant-provider-execution.service'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const TENANT_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '44444444-4444-4444-8444-444444444444'
const NODE_ID = '55555555-5555-4555-8555-555555555555'
const RESERVATION_ID = '66666666-6666-4666-8666-666666666666'

const CLAIMED: ClaimedCortexAssistantGenerationJob = {
  jobId: JOB_ID,
  requestId: REQUEST_ID,
  attemptNumber: 2,
  tenantId: TENANT_ID,
  userId: USER_ID,
  claimTokenHash: 'a'.repeat(64),
  question: 'What changed?',
  evidence: [
    { nodeId: NODE_ID, nodeType: 'project', title: 'Tower', summary: null },
  ],
}

function harness(enabled = true) {
  const config = {
    get: vi.fn((key: string, fallback?: unknown) => {
      const values: Record<string, unknown> = enabled
        ? {
            ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED: true,
            ERP_CORTEX_ASSISTANT_GENERATION_JOBS_TENANT_IDS: [TENANT_ID],
            ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_ENABLED: true,
            ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_TENANT_IDS: [TENANT_ID],
            ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_ENABLED: true,
            ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_TENANT_IDS: [TENANT_ID],
          }
        : {}
      return values[key] ?? fallback
    }),
  } as unknown as ConfigService
  const budget = {
    reconcileSupersededAttempts: vi.fn().mockResolvedValue(1),
    reserve: vi.fn().mockResolvedValue({
      reservationId: RESERVATION_ID,
      status: 'reserved',
      replayed: false,
    }),
    markDispatched: vi.fn().mockResolvedValue({
      reservationId: RESERVATION_ID,
      status: 'dispatched',
      replayed: false,
    }),
    settle: vi.fn().mockResolvedValue({
      reservationId: RESERVATION_ID,
      status: 'settled',
      replayed: false,
    }),
    reconcileAttempt: vi.fn().mockResolvedValue(1),
  } as unknown as CortexAssistantProviderBudgetService
  const adapter = {
    plan: vi.fn().mockReturnValue({
      provider: 'fake',
      model: 'deterministic-grounded-v1',
      maxCostMicros: '400',
    }),
    dispatch: vi.fn().mockResolvedValue({
      content: 'Grounded fake result',
      citationNodeIds: [NODE_ID],
      model: 'deterministic-grounded-v1',
      consumedCostMicros: '125',
    }),
  } as unknown as CortexAssistantProviderAdapter
  return {
    service: new CortexAssistantProviderExecutionService(
      config,
      budget,
      adapter
    ),
    budget,
    adapter,
  }
}

describe('CortexAssistantProviderExecutionService', () => {
  it('stays closed unless execution and budget gates match the tenant', async () => {
    const probe = harness(false)
    expect(probe.service.enabledForTenant(TENANT_ID)).toBe(false)
    await expect(probe.service.generate(CLAIMED)).rejects.toMatchObject({
      code: 'provider_execution_disabled',
      retryable: false,
    })
    expect(probe.budget.reserve).not.toHaveBeenCalled()
    expect(probe.adapter.dispatch).not.toHaveBeenCalled()
  })

  it('fails before reservation when the production adapter is unavailable', async () => {
    const probe = harness()
    ;(probe.adapter.plan as ReturnType<typeof vi.fn>).mockReturnValue(null)
    await expect(probe.service.generate(CLAIMED)).rejects.toMatchObject({
      code: 'provider_adapter_unavailable',
      retryable: false,
    })
    expect(probe.budget.reserve).not.toHaveBeenCalled()
  })

  it('reconciles old attempts, reserves, dispatches once, and settles actual cost', async () => {
    const probe = harness()
    await expect(probe.service.generate(CLAIMED)).resolves.toEqual({
      providerAttemptId: RESERVATION_ID,
      content: 'Grounded fake result',
      citationNodeIds: [NODE_ID],
      model: 'deterministic-grounded-v1',
    })
    expect(probe.budget.reconcileSupersededAttempts).toHaveBeenCalledWith(
      JOB_ID,
      2
    )
    expect(probe.budget.reserve).toHaveBeenCalledWith({
      jobId: JOB_ID,
      attemptNumber: 2,
      provider: 'fake',
      model: 'deterministic-grounded-v1',
      maxCostMicros: '400',
    })
    expect(probe.adapter.dispatch).toHaveBeenCalledOnce()
    expect(probe.budget.settle).toHaveBeenCalledWith({
      reservationId: RESERVATION_ID,
      consumedCostMicros: '125',
      outcomeCode: 'provider_succeeded',
    })
    expect(probe.budget.reconcileAttempt).not.toHaveBeenCalled()
    expect(
      (probe.budget.reserve as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    ).toBeLessThan(
      (probe.adapter.dispatch as ReturnType<typeof vi.fn>).mock
        .invocationCallOrder[0] ?? 0
    )
  })

  it('never calls the adapter after a replayed dispatch', async () => {
    const probe = harness()
    ;(
      probe.budget.markDispatched as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      reservationId: RESERVATION_ID,
      status: 'dispatched',
      replayed: true,
    })
    await expect(probe.service.generate(CLAIMED)).rejects.toMatchObject({
      code: 'provider_dispatch_replay',
      retryable: false,
    })
    expect(probe.adapter.dispatch).not.toHaveBeenCalled()
    expect(probe.budget.reconcileAttempt).toHaveBeenCalledWith(
      RESERVATION_ID,
      'replayed'
    )
  })

  it('conservatively reconciles a failed dispatched fake call', async () => {
    const probe = harness()
    ;(probe.adapter.dispatch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new CortexAssistantProviderAdapterError('provider_request_failed', true)
    )
    await expect(probe.service.generate(CLAIMED)).rejects.toEqual(
      new CortexAssistantProviderExecutionError(
        'provider_request_failed',
        true
      )
    )
    expect(probe.budget.reconcileAttempt).toHaveBeenCalledWith(
      RESERVATION_ID,
      'execution_failed'
    )
    expect(probe.budget.settle).not.toHaveBeenCalled()
  })

  it('rejects citations outside the authorized evidence set and reconciles cost', async () => {
    const probe = harness()
    ;(probe.adapter.dispatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: 'Untrusted citation',
      citationNodeIds: ['77777777-7777-4777-8777-777777777777'],
      model: 'deterministic-grounded-v1',
      consumedCostMicros: '125',
    })
    await expect(probe.service.generate(CLAIMED)).rejects.toMatchObject({
      code: 'provider_response_invalid',
      retryable: false,
    })
    expect(probe.budget.reconcileAttempt).toHaveBeenCalledWith(
      RESERVATION_ID,
      'execution_failed'
    )
  })
})
