import { Logger } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CortexAssistantProviderCircuitAlertObservability } from './cortex-assistant-provider-circuit-alert.observability'

describe('CortexAssistantProviderCircuitAlertObservability', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps fixed-cardinality counters and emits sanitized metric records', () => {
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined)
    const metrics = new CortexAssistantProviderCircuitAlertObservability()

    metrics.recordPostCommitEnqueue('enqueued')
    metrics.recordPostCommitEnqueue('failed')
    metrics.recordRecoveryFallback('skipped')

    expect(metrics.snapshot()).toEqual({
      'post_commit.enqueued': 1,
      'post_commit.skipped': 0,
      'post_commit.failed': 1,
      'recovery_fallback.enqueued': 0,
      'recovery_fallback.skipped': 1,
      'recovery_fallback.failed': 0,
    })
    expect(log).toHaveBeenCalledTimes(3)
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      event: 'erp.cortex.provider_circuit_alert.enqueue_metric',
      metric: 'cortex_provider_circuit_alert_enqueue_total',
      phase: 'post_commit',
      outcome: 'enqueued',
      value: 1,
      total: 1,
    })
  })
})
