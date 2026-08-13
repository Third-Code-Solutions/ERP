import { cortexAssistantProviderAttempts } from '@third-code-erp/database'
import type { CortexAssistantProviderCircuitState } from '@third-code-erp/shared-types'
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm'
import type { DatabaseTransaction } from '../database/database.service'

export interface CortexAssistantProviderCircuitPolicy {
  id: string
  tenantId: string
  failureThreshold: number
  failureWindowSeconds: number
  cooldownSeconds: number
}

export interface CortexAssistantProviderCircuitSnapshot {
  state: CortexAssistantProviderCircuitState
  failureCount: number
  tripStartedAt: Date | null
  retryAt: Date | null
  probeInFlight: boolean
  probeAttemptId: string | null
}

interface CircuitEvidenceRow extends Record<string, unknown> {
  failureCount: number
  tripped: boolean
  tripStartedAt: string | null
  latestFailureAt: string | null
}

export function evaluateCortexAssistantProviderCircuit(input: {
  policy: CortexAssistantProviderCircuitPolicy
  failureCount: number
  tripped: boolean
  tripStartedAt: Date | null
  latestFailureAt: Date | null
  probeAttemptId: string | null
  now: Date
}): CortexAssistantProviderCircuitSnapshot {
  if (!input.tripped) {
    return {
      state: 'closed',
      failureCount: input.failureCount,
      tripStartedAt: null,
      retryAt: null,
      probeInFlight: false,
      probeAttemptId: null,
    }
  }
  if (!input.latestFailureAt || !input.tripStartedAt) {
    throw new Error('Provider circuit failure evidence is missing')
  }

  const retryAt = new Date(
    input.latestFailureAt.getTime() + input.policy.cooldownSeconds * 1_000
  )
  return {
    state: retryAt.getTime() > input.now.getTime() ? 'open' : 'half_open',
    failureCount: input.failureCount,
    tripStartedAt: input.tripStartedAt,
    retryAt,
    probeInFlight: input.probeAttemptId !== null,
    probeAttemptId: input.probeAttemptId,
  }
}

export async function readCortexAssistantProviderCircuit(
  transaction: DatabaseTransaction,
  policy: CortexAssistantProviderCircuitPolicy,
  now: Date
): Promise<CortexAssistantProviderCircuitSnapshot> {
  const [evidence] = await transaction.execute<CircuitEvidenceRow>(sql`
    with latest_success as (
      select terminal_at, id
      from ${cortexAssistantProviderAttempts}
      where tenant_id = ${policy.tenantId}
        and policy_id = ${policy.id}
        and status = 'settled'
        and outcome_code = 'provider_succeeded'
      order by terminal_at desc, id desc
      limit 1
    ), current_failures as (
      select
        attempt.terminal_at,
        attempt.id,
        lag(attempt.terminal_at, ${policy.failureThreshold - 1}) over (
          order by attempt.terminal_at, attempt.id
        ) as threshold_start
      from ${cortexAssistantProviderAttempts} as attempt
      left join latest_success as success on true
      where attempt.tenant_id = ${policy.tenantId}
        and attempt.policy_id = ${policy.id}
        and attempt.status = 'settled'
        and attempt.outcome_code <> 'provider_succeeded'
        and (
          success.terminal_at is null
          or (attempt.terminal_at, attempt.id) > (success.terminal_at, success.id)
        )
    )
    select
      least(count(*), ${policy.failureThreshold})::int as "failureCount",
      (
        min(threshold_start) filter (
          where threshold_start is not null
            and extract(epoch from (terminal_at - threshold_start))
              <= ${policy.failureWindowSeconds}
        )
      )::text as "tripStartedAt",
      max(terminal_at)::text as "latestFailureAt",
      coalesce(bool_or(
        threshold_start is not null
        and extract(epoch from (terminal_at - threshold_start))
          <= ${policy.failureWindowSeconds}
      ), false) as tripped
    from current_failures
  `)
  if (!evidence) throw new Error('Provider circuit evidence is unavailable')

  const failureCount = Number(evidence.failureCount)
  if (
    !Number.isSafeInteger(failureCount) ||
    failureCount < 0 ||
    failureCount > policy.failureThreshold
  ) {
    throw new Error('Provider circuit failure count is invalid')
  }
  const latestFailureAt = evidence.latestFailureAt
    ? new Date(evidence.latestFailureAt)
    : null
  if (latestFailureAt && !Number.isFinite(latestFailureAt.getTime())) {
    throw new Error('Provider circuit failure time is invalid')
  }
  const tripStartedAt = evidence.tripStartedAt
    ? new Date(evidence.tripStartedAt)
    : null
  if (tripStartedAt && !Number.isFinite(tripStartedAt.getTime())) {
    throw new Error('Provider circuit trip time is invalid')
  }

  let probeAttemptId: string | null = null
  if (evidence.tripped && latestFailureAt) {
    const [probe] = await transaction
      .select({ id: cortexAssistantProviderAttempts.id })
      .from(cortexAssistantProviderAttempts)
      .where(
        and(
          eq(cortexAssistantProviderAttempts.tenant_id, policy.tenantId),
          eq(cortexAssistantProviderAttempts.policy_id, policy.id),
          inArray(cortexAssistantProviderAttempts.status, [
            'reserved',
            'dispatched',
          ]),
          gt(cortexAssistantProviderAttempts.created_at, latestFailureAt)
        )
      )
      .orderBy(
        asc(cortexAssistantProviderAttempts.created_at),
        asc(cortexAssistantProviderAttempts.id)
      )
      .limit(1)
    probeAttemptId = probe?.id ?? null
  }

  return evaluateCortexAssistantProviderCircuit({
    policy,
    failureCount,
    tripped: evidence.tripped,
    tripStartedAt,
    latestFailureAt,
    probeAttemptId,
    now,
  })
}
