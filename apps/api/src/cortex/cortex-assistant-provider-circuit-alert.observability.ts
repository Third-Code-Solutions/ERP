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

export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ENQUEUE_METRIC =
  'cortex_provider_circuit_alert_enqueue_total'
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_OBSERVABILITY_SCHEMA_VERSION =
  1

/**
 * Deployment-observability policy for the process snapshot seam.
 *
 * This is a policy record, not a route or an authorization mechanism. Keeping
 * it beside the seam makes any future exporter reviewable against explicit
 * scope, redaction, retention, rate, and spend boundaries.
 */
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_OPERATIONAL_SNAPSHOT_POLICY =
  Object.freeze({
    authorization: 'internal_nest_service_only',
    exposure: 'backend_only',
    scope: 'process',
    tenantAttribution: 'none',
    redaction: 'fixed_cardinality_counters_only',
    retention: 'process_lifetime',
    rateLimit: 'none_until_exporter',
    externalSink: 'disabled',
    costControl: 'zero_external_spend',
    owner: 'erp_backend_owner',
    consumer: 'none_registered',
    allowedConsumer: 'future_reviewed_operational_adapter',
    releaseIdentity: 'git_commit_sha',
    rollback: 'last_known_good_artifact',
    deployment: 'separate_review_required',
  } as const)

export interface CortexAssistantProviderCircuitAlertOperationalAdapterTriggerInput {
  readonly callerAuthorizationReviewed: boolean
  readonly scopeReviewed: boolean
  readonly redactionReviewed: boolean
  readonly retentionReviewed: boolean
  readonly rateLimitReviewed: boolean
  readonly costControlReviewed: boolean
  readonly ownerApproved: boolean
  readonly releaseIdentityVerified: boolean
  readonly rollbackArtifactVerified: boolean
}

export interface CortexAssistantProviderCircuitAlertOperationalAdapterTriggerResult {
  readonly status: 'blocked' | 'eligible'
  readonly blockers: readonly string[]
}

const OPERATIONAL_ADAPTER_TRIGGER_REQUIREMENTS: ReadonlyArray<
  readonly [
    keyof CortexAssistantProviderCircuitAlertOperationalAdapterTriggerInput,
    string,
  ]
> = [
  ['callerAuthorizationReviewed', 'caller authorization review'],
  ['scopeReviewed', 'process-versus-tenant scope review'],
  ['redactionReviewed', 'field redaction review'],
  ['retentionReviewed', 'retention and deletion review'],
  ['rateLimitReviewed', 'bounded rate-limit review'],
  ['costControlReviewed', 'provider/network cost-control review'],
  ['ownerApproved', 'ERP backend owner approval'],
  ['releaseIdentityVerified', 'exact Git release SHA verification'],
  ['rollbackArtifactVerified', 'last-known-good rollback artifact verification'],
]

/**
 * Evaluate evidence for a future operational adapter. `eligible` is an
 * evidence result only; it never enables a route, exporter, sink, or deploy.
 */
export function evaluateCortexAssistantProviderCircuitAlertOperationalAdapterTrigger(
  input: CortexAssistantProviderCircuitAlertOperationalAdapterTriggerInput
): CortexAssistantProviderCircuitAlertOperationalAdapterTriggerResult {
  const blockers = OPERATIONAL_ADAPTER_TRIGGER_REQUIREMENTS.filter(
    ([key]) => !input[key]
  ).map(([, label]) => label)

  return Object.freeze({
    status: blockers.length === 0 ? 'eligible' : 'blocked',
    blockers: Object.freeze(blockers),
  })
}

export interface CortexAssistantProviderCircuitAlertOperationalSnapshot {
  readonly schemaVersion: 1
  readonly scope: 'process'
  readonly metric: typeof CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ENQUEUE_METRIC
  readonly counters: CortexAssistantProviderCircuitAlertMetricSnapshot
}

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

  /**
   * Backend-only read seam for a future reviewed operational exporter.
   * Deliberately not exposed through a controller or browser route.
   */
  readOperationalSnapshot(): CortexAssistantProviderCircuitAlertOperationalSnapshot {
    return Object.freeze({
      schemaVersion:
        CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_OBSERVABILITY_SCHEMA_VERSION,
      scope: 'process',
      metric: CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ENQUEUE_METRIC,
      counters: Object.freeze(this.snapshot()),
    })
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
        metric: CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ENQUEUE_METRIC,
        phase,
        outcome,
        value: 1,
        total,
      })
    )
  }
}
