import { Logger } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_OPERATIONAL_SNAPSHOT_POLICY,
  CortexAssistantProviderCircuitAlertObservability,
  evaluateCortexAssistantProviderCircuitAlertOperationalAdapterTrigger,
} from './cortex-assistant-provider-circuit-alert.observability'

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

  it('exposes only an immutable backend operational snapshot', () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    const metrics = new CortexAssistantProviderCircuitAlertObservability()
    metrics.recordRecoveryFallback('failed')

    const snapshot = metrics.readOperationalSnapshot()

    expect(snapshot).toEqual({
      schemaVersion: 1,
      scope: 'process',
      metric: 'cortex_provider_circuit_alert_enqueue_total',
      counters: {
        'post_commit.enqueued': 0,
        'post_commit.skipped': 0,
        'post_commit.failed': 0,
        'recovery_fallback.enqueued': 0,
        'recovery_fallback.skipped': 0,
        'recovery_fallback.failed': 1,
      },
    })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.counters)).toBe(true)
    expect(JSON.stringify(snapshot)).not.toMatch(
      /tenant|eventKey|credential|payload|error/i
    )
  })

  it('keeps deployment-observability controls explicit and frozen', () => {
    expect(
      CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_OPERATIONAL_SNAPSHOT_POLICY
    ).toEqual({
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
      releaseIdentity: 'git_commit_sha',
      rollback: 'last_known_good_artifact',
      deployment: 'separate_review_required',
    })
    expect(
      Object.isFrozen(
        CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_OPERATIONAL_SNAPSHOT_POLICY
      )
    ).toBe(true)
  })

  it('fails closed when adapter evidence is absent', () => {
    const result =
      evaluateCortexAssistantProviderCircuitAlertOperationalAdapterTrigger({
        callerAuthorizationReviewed: false,
        scopeReviewed: false,
        redactionReviewed: false,
        retentionReviewed: false,
        rateLimitReviewed: false,
        costControlReviewed: false,
        ownerApproved: false,
        releaseIdentityVerified: false,
        rollbackArtifactVerified: false,
      })

    expect(result).toEqual({
      status: 'blocked',
      blockers: [
        'caller authorization review',
        'process-versus-tenant scope review',
        'field redaction review',
        'retention and deletion review',
        'bounded rate-limit review',
        'provider/network cost-control review',
        'ERP backend owner approval',
        'exact Git release SHA verification',
        'last-known-good rollback artifact verification',
      ],
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.blockers)).toBe(true)
  })

  it('returns eligibility evidence only when every review is clear', () => {
    const result =
      evaluateCortexAssistantProviderCircuitAlertOperationalAdapterTrigger({
        callerAuthorizationReviewed: true,
        scopeReviewed: true,
        redactionReviewed: true,
        retentionReviewed: true,
        rateLimitReviewed: true,
        costControlReviewed: true,
        ownerApproved: true,
        releaseIdentityVerified: true,
        rollbackArtifactVerified: true,
      })

    expect(result).toEqual({ status: 'eligible', blockers: [] })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.blockers)).toBe(true)
  })
})
