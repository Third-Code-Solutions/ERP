import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  cortexAssistantProviderAttempts,
  cortexAssistantProviderPolicies,
} from '@third-code-erp/database'
import {
  CORTEX_ASSISTANT_PROVIDER_LATENCY_MAX_MS,
  cortexAssistantProviderHealthResultSchema,
  type CortexAssistantProviderHealthQuery,
  type CortexAssistantProviderHealthResult,
} from '@third-code-erp/shared-types'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'
import { readCortexAssistantProviderCircuit } from './cortex-assistant-provider-health.query'

interface ClockRow extends Record<string, unknown> {
  asOf: string
  budgetDate: string
}

interface UsageRow {
  heldMicros: string
  consumedMicros: string
  reserved: number
  dispatched: number
  succeeded: number
  failed: number
  outcomeUnknown: number
}

interface LatencyRow {
  p50: string | null
  p95: string | null
  p99: string | null
}

function boundedCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) {
    throw new InternalServerErrorException(
      'Provider health count is out of range'
    )
  }
  return value
}

function boundedLatency(value: string | null): number | null {
  if (value === null) return null
  const milliseconds = Number(value)
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 0 ||
    milliseconds > CORTEX_ASSISTANT_PROVIDER_LATENCY_MAX_MS
  ) {
    throw new InternalServerErrorException(
      'Provider health latency is out of range'
    )
  }
  return milliseconds
}

@Injectable()
export class CortexAssistantProviderHealthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  read(
    query: CortexAssistantProviderHealthQuery,
    principal: Pick<ErpPrincipal, 'tenantId'>
  ): Promise<CortexAssistantProviderHealthResult> {
    return this.database.client.transaction(async (transaction) => {
      const [clock] = await transaction.execute<ClockRow>(sql`
        select
          statement_timestamp()::text as "asOf",
          (pg_catalog.timezone('UTC', statement_timestamp()))::date::text
            as "budgetDate"
      `)
      if (!clock) {
        throw new InternalServerErrorException(
          'Provider health clock is unavailable'
        )
      }
      const now = new Date(clock.asOf)
      if (!Number.isFinite(now.getTime())) {
        throw new InternalServerErrorException(
          'Provider health clock is invalid'
        )
      }

      const [policy] = await transaction
        .select({
          id: cortexAssistantProviderPolicies.id,
          tenantId: cortexAssistantProviderPolicies.tenant_id,
          provider: cortexAssistantProviderPolicies.provider,
          model: cortexAssistantProviderPolicies.model,
          enabled: cortexAssistantProviderPolicies.enabled,
          requestLimitMicros:
            cortexAssistantProviderPolicies.request_limit_micros,
          dailyLimitMicros:
            cortexAssistantProviderPolicies.daily_limit_micros,
          failureThreshold:
            cortexAssistantProviderPolicies.circuit_failure_threshold,
          failureWindowSeconds:
            cortexAssistantProviderPolicies.circuit_failure_window_seconds,
          cooldownSeconds:
            cortexAssistantProviderPolicies.circuit_cooldown_seconds,
        })
        .from(cortexAssistantProviderPolicies)
        .where(
          and(
            eq(cortexAssistantProviderPolicies.tenant_id, principal.tenantId),
            eq(cortexAssistantProviderPolicies.provider, query.provider),
            eq(cortexAssistantProviderPolicies.model, query.model)
          )
        )
        .limit(1)
      if (!policy) {
        throw new NotFoundException('Provider health policy was not found')
      }

      const [usage] = (await transaction
        .select({
          heldMicros: sql<string>`coalesce(sum(
            case when ${cortexAssistantProviderAttempts.status}
              in ('reserved', 'dispatched')
              then ${cortexAssistantProviderAttempts.reserved_cost_micros}
              else 0 end
          ), 0)::text`,
          consumedMicros: sql<string>`coalesce(sum(
            case when ${cortexAssistantProviderAttempts.status} = 'settled'
              then ${cortexAssistantProviderAttempts.consumed_cost_micros}
              else 0 end
          ), 0)::text`,
          reserved: sql<number>`count(*) filter (
            where ${cortexAssistantProviderAttempts.status} = 'reserved'
          )::int`,
          dispatched: sql<number>`count(*) filter (
            where ${cortexAssistantProviderAttempts.status} = 'dispatched'
          )::int`,
          succeeded: sql<number>`count(*) filter (
            where ${cortexAssistantProviderAttempts.status} = 'settled'
              and ${cortexAssistantProviderAttempts.outcome_code}
                = 'provider_succeeded'
          )::int`,
          failed: sql<number>`count(*) filter (
            where ${cortexAssistantProviderAttempts.status} = 'settled'
              and ${cortexAssistantProviderAttempts.outcome_code}
                <> 'provider_succeeded'
          )::int`,
          outcomeUnknown: sql<number>`count(*) filter (
            where ${cortexAssistantProviderAttempts.status} = 'settled'
              and ${cortexAssistantProviderAttempts.outcome_code}
                like '%outcome_unknown'
          )::int`,
        })
        .from(cortexAssistantProviderAttempts)
        .where(
          and(
            eq(cortexAssistantProviderAttempts.tenant_id, principal.tenantId),
            eq(cortexAssistantProviderAttempts.policy_id, policy.id),
            eq(cortexAssistantProviderAttempts.budget_date, clock.budgetDate)
          )
        )) as UsageRow[]
      if (!usage) {
        throw new InternalServerErrorException(
          'Provider health usage is unavailable'
        )
      }

      const durationMs = sql<number>`greatest(0, floor(extract(epoch from (
        ${cortexAssistantProviderAttempts.terminal_at}
          - ${cortexAssistantProviderAttempts.dispatched_at}
      )) * 1000))`
      const [latency] = (await transaction
        .select({
          p50: sql<string | null>`percentile_disc(0.50) within group (
            order by ${durationMs}
          )::text`,
          p95: sql<string | null>`percentile_disc(0.95) within group (
            order by ${durationMs}
          )::text`,
          p99: sql<string | null>`percentile_disc(0.99) within group (
            order by ${durationMs}
          )::text`,
        })
        .from(cortexAssistantProviderAttempts)
        .where(
          and(
            eq(cortexAssistantProviderAttempts.tenant_id, principal.tenantId),
            eq(cortexAssistantProviderAttempts.policy_id, policy.id),
            eq(cortexAssistantProviderAttempts.budget_date, clock.budgetDate),
            eq(cortexAssistantProviderAttempts.status, 'settled'),
            isNotNull(cortexAssistantProviderAttempts.dispatched_at),
            isNotNull(cortexAssistantProviderAttempts.terminal_at)
          )
        )) as LatencyRow[]
      const circuit = await readCortexAssistantProviderCircuit(
        transaction,
        policy,
        now
      )
      const heldMicros = Number(usage.heldMicros)
      const consumedMicros = Number(usage.consumedMicros)
      if (
        !Number.isSafeInteger(heldMicros) ||
        heldMicros < 0 ||
        !Number.isSafeInteger(consumedMicros) ||
        consumedMicros < 0
      ) {
        throw new InternalServerErrorException(
          'Provider health spend is out of range'
        )
      }
      const remainingMicros = Math.max(
        0,
        policy.dailyLimitMicros - heldMicros - consumedMicros
      )

      return cortexAssistantProviderHealthResultSchema.parse({
        asOf: now.toISOString(),
        budgetDate: clock.budgetDate,
        provider: policy.provider,
        model: policy.model,
        policyEnabled: policy.enabled,
        requestLimitMicros: String(policy.requestLimitMicros),
        dailyLimitMicros: String(policy.dailyLimitMicros),
        spend: {
          heldMicros: String(heldMicros),
          consumedMicros: String(consumedMicros),
          remainingMicros: String(remainingMicros),
        },
        attempts: {
          reserved: boundedCount(usage.reserved),
          dispatched: boundedCount(usage.dispatched),
          succeeded: boundedCount(usage.succeeded),
          failed: boundedCount(usage.failed),
          outcomeUnknown: boundedCount(usage.outcomeUnknown),
        },
        latencyMs: {
          p50: boundedLatency(latency?.p50 ?? null),
          p95: boundedLatency(latency?.p95 ?? null),
          p99: boundedLatency(latency?.p99 ?? null),
        },
        circuit: {
          state: circuit.state,
          failureThreshold: policy.failureThreshold,
          failureWindowSeconds: policy.failureWindowSeconds,
          cooldownSeconds: policy.cooldownSeconds,
          failureCount: circuit.failureCount,
          retryAt: circuit.retryAt?.toISOString() ?? null,
          probeInFlight: circuit.probeInFlight,
        },
        runbook: 'cortex-provider-circuit',
      })
    })
  }
}
