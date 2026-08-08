import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ClaimedCortexAssistantGenerationJob } from './cortex-assistant-generation.state'
import { cortexAssistantGenerationCompletionHash } from './cortex-assistant-generation-completion'
import {
  CortexAssistantProviderAdapter,
  CortexAssistantProviderAdapterError,
} from './cortex-assistant-provider.adapter'
import type { CortexAssistantProviderBudgetService } from './cortex-assistant-provider-budget.service'
import {
  CortexAssistantProviderExecutionError,
  CortexAssistantProviderExecutionService,
} from './cortex-assistant-provider-execution.service'
import {
  cortexAssistantProviderDispatchKey,
  cortexAssistantProviderRequestFingerprint,
  cortexAssistantProviderRequestIdHash,
} from './cortex-assistant-provider-protocol'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const TENANT_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '44444444-4444-4444-8444-444444444444'
const NODE_ID = '55555555-5555-4555-8555-555555555555'
const RESERVATION_ID = '66666666-6666-4666-8666-666666666666'
const MODEL = 'third-code-provider-v1'
const PROVIDER_REQUEST_ID = 'req_test-001'

const CLAIMED: ClaimedCortexAssistantGenerationJob = {
  jobId: JOB_ID,
  requestId: REQUEST_ID,
  attemptNumber: 2,
  tenantId: TENANT_ID,
  userId: USER_ID,
  claimTokenHash: 'a'.repeat(64),
  question:
    'Email owner@example.com or call +639171234567 about TIN 123-456-789.',
  evidence: [
    {
      nodeId: NODE_ID,
      nodeType: 'project',
      title: 'Tower owner@example.com',
      summary: 'Call 09171234567.',
    },
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
      provider: 'third-code-test',
      model: MODEL,
      maxCostMicros: '400',
      timeoutMs: 15_000,
    }),
    dispatch: vi.fn().mockResolvedValue({
      protocolVersion: 1,
      providerRequestId: PROVIDER_REQUEST_ID,
      content: 'Grounded provider result',
      citationNodeIds: [NODE_ID],
      model: MODEL,
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

  it('rejects an invalid provider plan before reservation', async () => {
    const probe = harness()
    ;(probe.adapter.plan as ReturnType<typeof vi.fn>).mockReturnValue({
      provider: 'third-code-test',
      model: MODEL,
      maxCostMicros: '400',
      timeoutMs: 61_000,
    })
    await expect(probe.service.generate(CLAIMED)).rejects.toMatchObject({
      code: 'provider_plan_invalid',
      retryable: false,
    })
    expect(probe.budget.reconcileSupersededAttempts).not.toHaveBeenCalled()
    expect(probe.budget.reserve).not.toHaveBeenCalled()
  })

  it('dispatches one redacted bounded request and settles exact response evidence', async () => {
    const probe = harness()
    await expect(probe.service.generate(CLAIMED)).resolves.toEqual({
      providerAttemptId: RESERVATION_ID,
      content: 'Grounded provider result',
      citationNodeIds: [NODE_ID],
      model: MODEL,
    })

    expect(probe.budget.reconcileSupersededAttempts).toHaveBeenCalledWith(
      JOB_ID,
      2
    )
    expect(probe.budget.reserve).toHaveBeenCalledWith({
      jobId: JOB_ID,
      attemptNumber: 2,
      provider: 'third-code-test',
      model: MODEL,
      maxCostMicros: '400',
    })
    expect(probe.adapter.dispatch).toHaveBeenCalledOnce()
    const [request, signal] = (
      probe.adapter.dispatch as ReturnType<typeof vi.fn>
    ).mock.calls[0] ?? []
    expect(request).toEqual({
      protocolVersion: 1,
      dispatchKey: cortexAssistantProviderDispatchKey(RESERVATION_ID),
      provider: 'third-code-test',
      model: MODEL,
      timeoutMs: 15_000,
      question:
        'Email [email redacted] or call [phone redacted] about [tax id redacted].',
      evidence: [
        {
          nodeId: NODE_ID,
          nodeType: 'project',
          title: 'Tower [email redacted]',
          summary: 'Call [phone redacted].',
        },
      ],
    })
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(JSON.stringify(request)).not.toMatch(
      new RegExp([JOB_ID, REQUEST_ID, TENANT_ID, USER_ID].join('|'))
    )

    const requestFingerprint = cortexAssistantProviderRequestFingerprint(request)
    expect(probe.budget.markDispatched).toHaveBeenCalledWith({
      reservationId: RESERVATION_ID,
      protocolVersion: 1,
      dispatchKey: request.dispatchKey,
      requestFingerprint,
    })
    expect(probe.budget.settle).toHaveBeenCalledWith({
      reservationId: RESERVATION_ID,
      protocolVersion: 1,
      consumedCostMicros: '125',
      outcomeCode: 'provider_succeeded',
      providerRequestIdHash:
        cortexAssistantProviderRequestIdHash(PROVIDER_REQUEST_ID),
      responseFingerprint: cortexAssistantGenerationCompletionHash({
        jobId: JOB_ID,
        requestId: REQUEST_ID,
        completion: {
          outcome: 'provider_grounded',
          providerAttemptId: RESERVATION_ID,
          content: 'Grounded provider result',
          citationNodeIds: [NODE_ID],
          model: MODEL,
        },
      }),
    })
    expect(probe.budget.reconcileAttempt).not.toHaveBeenCalled()
  })

  it('releases a reservation when the bounded request cannot be constructed', async () => {
    const probe = harness()
    await expect(
      probe.service.generate({
        ...CLAIMED,
        evidence: [{ ...CLAIMED.evidence[0]!, nodeType: '' }],
      })
    ).rejects.toEqual(
      new CortexAssistantProviderExecutionError(
        'provider_request_rejected',
        false
      )
    )
    expect(probe.budget.reconcileAttempt).toHaveBeenCalledWith(
      RESERVATION_ID,
      'provider_request_rejected'
    )
    expect(probe.budget.markDispatched).not.toHaveBeenCalled()
    expect(probe.adapter.dispatch).not.toHaveBeenCalled()
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

  it('terminally fails and conservatively reconciles a rejected provider call', async () => {
    const probe = harness()
    ;(probe.adapter.dispatch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new CortexAssistantProviderAdapterError('provider_rate_limited')
    )
    await expect(probe.service.generate(CLAIMED)).rejects.toEqual(
      new CortexAssistantProviderExecutionError('provider_rate_limited', false)
    )
    expect(probe.budget.reconcileAttempt).toHaveBeenCalledWith(
      RESERVATION_ID,
      'provider_rate_limited'
    )
    expect(probe.budget.settle).not.toHaveBeenCalled()
  })

  it('aborts on the bounded timeout and does not retry uncertain dispatch', async () => {
    vi.useFakeTimers()
    try {
      const probe = harness()
      ;(probe.adapter.plan as ReturnType<typeof vi.fn>).mockReturnValue({
        provider: 'third-code-test',
        model: MODEL,
        maxCostMicros: '400',
        timeoutMs: 1_000,
      })
      ;(probe.adapter.dispatch as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(() => undefined)
      )

      const result = expect(probe.service.generate(CLAIMED)).rejects.toMatchObject(
        {
          code: 'provider_request_timeout',
          retryable: false,
        }
      )
      await vi.advanceTimersByTimeAsync(1_000)
      await result
      const signal = (
        probe.adapter.dispatch as ReturnType<typeof vi.fn>
      ).mock.calls[0]?.[1] as AbortSignal
      expect(signal.aborted).toBe(true)
      expect(probe.budget.reconcileAttempt).toHaveBeenCalledWith(
        RESERVATION_ID,
        'provider_request_timeout'
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects citations outside the authorized evidence set', async () => {
    const probe = harness()
    ;(probe.adapter.dispatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      protocolVersion: 1,
      providerRequestId: PROVIDER_REQUEST_ID,
      content: 'Untrusted citation',
      citationNodeIds: ['77777777-7777-4777-8777-777777777777'],
      model: MODEL,
      consumedCostMicros: '125',
    })
    await expect(probe.service.generate(CLAIMED)).rejects.toMatchObject({
      code: 'provider_response_invalid',
      retryable: false,
    })
    expect(probe.budget.reconcileAttempt).toHaveBeenCalledWith(
      RESERVATION_ID,
      'provider_response_invalid'
    )
  })

  it('keeps reconciliation infrastructure failure retryable', async () => {
    const probe = harness()
    ;(probe.adapter.dispatch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new CortexAssistantProviderAdapterError('provider_request_failed')
    )
    ;(
      probe.budget.reconcileAttempt as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('database unavailable'))
    await expect(probe.service.generate(CLAIMED)).rejects.toMatchObject({
      code: 'provider_reconciliation_failed',
      retryable: true,
    })
  })
})
