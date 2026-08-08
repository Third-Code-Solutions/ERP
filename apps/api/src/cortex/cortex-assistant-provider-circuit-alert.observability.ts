import { Injectable, Logger } from '@nestjs/common'

export type CortexAssistantProviderCircuitAlertEnqueuePhase =
  | 'post_commit'
  | 'recovery_fallback'

export type CortexAssistantProviderCircuitAlertEnqueueOutcome =
  | 'enqueued'
  | 'skipped'
  | 'failed'

type CortexAssistantProviderCircuitAlertMetricKey =
  `${CortexAssistantProviderCircuitAlertEnqueuePhase}.${CortexAssistantProviderCircuitAlertEnqueueOutcome}`

export type CortexAssistantProviderCircuitAlertMetricSnapshot = Readonly<
  Record<CortexAssistantProviderCircuitAlertMetricKey, number>
>

const METRIC_NAME = 'cortex_provider_circuit_alert_enqueue_total'

/**
 * Process-local, fixed-cardinality enqueue metrics.
 *
 * This is intentionally a local seam until a reviewed metrics exporter is
 * approved. Labels never contain tenant IDs, event keys, or transport errors.
 */
@Injectable()
export class CortexAssistantProviderCircuitAlertObservability {
  private readonly logger = new Logger(
    CortexAssistantProviderCircuitAlertObservability.name
  )

  private readonly counters: Record<
    CortexAssistantProviderCircuitAlertMetricKey,
    number
  > = {
    'post_commit.enqueued': 0,
    'post_commit.skipped': 0,
    'post_commit.failed': 0,
    'recovery_fallback.enqueued': 0,
    'recovery_fallback.skipped': 0,
    'recovery_fallback.failed': 0,
  }

  recordPostCommitEnqueue(
    outcome: CortexAssistantProviderCircuitAlertEnqueueOutcome
  ): void {
    this.record('post_commit', outcome)
  }

  recordRecoveryFallback(
    outcome: CortexAssistantProviderCircuitAlertEnqueueOutcome
  ): void {
    this.record('recovery_fallback', outcome)
  }

  snapshot(): CortexAssistantProviderCircuitAlertMetricSnapshot {
    return { ...this.counters }
  }

  private record(
    phase: CortexAssistantProviderCircuitAlertEnqueuePhase,
    outcome: CortexAssistantProviderCircuitAlertEnqueueOutcome
  ): void {
    const key = `${phase}.${outcome}` as CortexAssistantProviderCircuitAlertMetricKey
    const total = this.counters[key] + 1
    this.counters[key] = total
    this.logger.log(
      JSON.stringify({
        event: 'erp.cortex.provider_circuit_alert.enqueue_metric',
        metric: METRIC_NAME,
        phase,
        outcome,
        value: 1,
        total,
      })
    )
  }
}
