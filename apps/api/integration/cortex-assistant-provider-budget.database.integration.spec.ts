import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import {
  auditLog,
  cortexAssistantGenerationJobs,
  cortexAssistantProviderAttempts,
  cortexAssistantProviderPolicies,
  cortexAssistantTurnRequests,
  cortexConversations,
  cortexMessages,
  db,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, asc, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import {
  CortexAssistantProviderBudgetService,
} from '../src/cortex/cortex-assistant-provider-budget.service'
import { cortexAssistantProviderDispatchKey } from '../src/cortex/cortex-assistant-provider-protocol'
import { CortexAssistantProviderHealthService } from '../src/cortex/cortex-assistant-provider-health.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const rollback = Symbol('rollback')

interface TenantFixture {
  tenantId: string
  userId: string
  suffix: string
}

interface JobFixture extends TenantFixture {
  jobId: string
}

function transactionBoundDatabase(
  transaction: DatabaseTransaction
): DatabaseService {
  const client = new Proxy({} as Database, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (
          callback: (
            scopedTransaction: DatabaseTransaction
          ) => Promise<unknown>
        ) => transaction.transaction(callback)
      }
      const value = Reflect.get(transaction, property)
      return typeof value === 'function' ? value.bind(transaction) : value
    },
  })
  return { client } as DatabaseService
}

async function alwaysRollback(
  callback: (transaction: DatabaseTransaction) => Promise<void>
): Promise<void> {
  try {
    await db.transaction(async (transaction) => {
      await callback(transaction)
      throw rollback
    })
  } catch (error) {
    if (error !== rollback) throw error
  }
}

async function seedTenant(
  transaction: DatabaseTransaction,
  label: string
): Promise<TenantFixture> {
  const tenantId = randomUUID()
  const userId = randomUUID()
  const suffix = randomUUID().slice(0, 12)
  await transaction.insert(tenants).values({
    id: tenantId,
    name: `Provider budget ${label}`,
    slug: `provider-budget-${label}-${suffix}`,
  })
  await transaction.insert(users).values({
    id: userId,
    tenant_id: tenantId,
    email: `provider-budget-${label}-${suffix}@integration.test`,
    full_name: `Provider budget ${label}`,
    role: 'admin',
  })
  return { tenantId, userId, suffix }
}

async function seedProcessingJob(
  transaction: DatabaseTransaction,
  tenant: TenantFixture,
  label: string
): Promise<JobFixture> {
  const conversationId = randomUUID()
  const userMessageId = randomUUID()
  const requestId = randomUUID()
  const jobId = randomUUID()
  const claimTokenHash = 'c'.repeat(64)
  await transaction.insert(cortexConversations).values({
    id: conversationId,
    tenant_id: tenant.tenantId,
    user_id: tenant.userId,
    title: `Provider budget ${label}`,
  })
  await transaction.insert(cortexMessages).values({
    id: userMessageId,
    tenant_id: tenant.tenantId,
    conversation_id: conversationId,
    role: 'user',
    content: `Provider budget ${label}`,
  })
  await transaction.insert(cortexAssistantTurnRequests).values({
    id: requestId,
    tenant_id: tenant.tenantId,
    user_id: tenant.userId,
    idempotency_key: `provider-budget-${label}`,
    request_hash: 'b'.repeat(64),
    state: 'processing',
    conversation_id: conversationId,
    user_message_id: userMessageId,
    claim_token_hash: claimTokenHash,
    lease_expires_at: new Date(Date.now() + 60_000),
  })
  await transaction.insert(cortexAssistantGenerationJobs).values({
    id: jobId,
    tenant_id: tenant.tenantId,
    user_id: tenant.userId,
    request_id: requestId,
    claim_token_hash: claimTokenHash,
    status: 'processing',
    attempt_count: 1,
  })
  return { ...tenant, jobId }
}

async function seedPolicy(
  transaction: DatabaseTransaction,
  tenantId: string,
  requestLimitMicros: number,
  dailyLimitMicros: number,
  circuit: {
    failureThreshold: number
    failureWindowSeconds: number
    cooldownSeconds: number
  } = {
    failureThreshold: 3,
    failureWindowSeconds: 300,
    cooldownSeconds: 900,
  }
): Promise<string> {
  const [policy] = await transaction
    .insert(cortexAssistantProviderPolicies)
    .values({
      tenant_id: tenantId,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      enabled: true,
      request_limit_micros: requestLimitMicros,
      daily_limit_micros: dailyLimitMicros,
      circuit_failure_threshold: circuit.failureThreshold,
      circuit_failure_window_seconds: circuit.failureWindowSeconds,
      circuit_cooldown_seconds: circuit.cooldownSeconds,
    })
    .returning({ id: cortexAssistantProviderPolicies.id })
  if (!policy) throw new Error('Provider policy fixture missing')
  return policy.id
}

async function seedSettledAttempt(
  transaction: DatabaseTransaction,
  job: JobFixture,
  policyId: string,
  outcomeCode: string,
  terminalAt: Date,
  durationMs = 1_000
): Promise<void> {
  const dispatchedAt = new Date(terminalAt.getTime() - durationMs)
  const createdAt = new Date(dispatchedAt.getTime() - 1_000)
  await transaction.insert(cortexAssistantProviderAttempts).values({
    tenant_id: job.tenantId,
    policy_id: policyId,
    job_id: job.jobId,
    attempt_number: 1,
    request_hash: '9'.repeat(64),
    status: 'settled',
    reserved_cost_micros: 100,
    consumed_cost_micros: 100,
    outcome_code: outcomeCode,
    created_at: createdAt,
    updated_at: terminalAt,
    dispatched_at: dispatchedAt,
    terminal_at: terminalAt,
  })
}

function budgetService(
  transaction: DatabaseTransaction,
  tenantIds: readonly string[],
  enabled = true
): CortexAssistantProviderBudgetService {
  return new CortexAssistantProviderBudgetService(
    new ConfigService({
      ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_ENABLED: enabled,
      ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_TENANT_IDS: [...tenantIds],
    }),
    transactionBoundDatabase(transaction),
    new AuditService()
  )
}

function reservation(jobId: string, maxCostMicros: string) {
  return {
    jobId,
    attemptNumber: 1,
    provider: 'openai',
    model: 'gpt-4.1-mini',
    maxCostMicros,
  } as const
}

function dispatch(reservationId: string) {
  return {
    reservationId,
    protocolVersion: 1 as const,
    dispatchKey: cortexAssistantProviderDispatchKey(reservationId),
    requestFingerprint: 'd'.repeat(64),
  }
}

function settlement(reservationId: string, consumedCostMicros: string) {
  return {
    reservationId,
    protocolVersion: 1 as const,
    consumedCostMicros,
    outcomeCode: 'provider_succeeded' as const,
    providerRequestIdHash: 'e'.repeat(64),
    responseFingerprint: 'f'.repeat(64),
  }
}

suite('Cortex assistant provider budget database integration', () => {
  it('reserves, dispatches, settles, releases, caps spend, and audits exact replay', async () => {
    await alwaysRollback(async (transaction) => {
      const tenant = await seedTenant(transaction, 'authority')
      const jobs = await Promise.all(
        ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].map((label) =>
          seedProcessingJob(transaction, tenant, label)
        )
      )
      const [one, two, three, four, five, six, seven, eight] = jobs
      if (
        !one ||
        !two ||
        !three ||
        !four ||
        !five ||
        !six ||
        !seven ||
        !eight
      ) {
        throw new Error('Provider budget job fixture missing')
      }
      await seedPolicy(transaction, tenant.tenantId, 400, 1_000)
      const service = budgetService(transaction, [tenant.tenantId])

      const first = await service.reserve(reservation(one.jobId, '300'))
      expect(first).toMatchObject({
        status: 'reserved',
        reservedCostMicros: '300',
        replayed: false,
      })
      await expect(
        service.reserve(reservation(one.jobId, '300'))
      ).resolves.toMatchObject({
        reservationId: first.reservationId,
        replayed: true,
      })
      await expect(
        service.reserve(reservation(one.jobId, '301'))
      ).rejects.toMatchObject({ code: 'provider_attempt_changed' })
      await expect(
        service.reserve(reservation(two.jobId, '401'))
      ).rejects.toMatchObject({ code: 'provider_request_budget_exceeded' })

      const second = await service.reserve(reservation(two.jobId, '400'))
      const third = await service.reserve(reservation(three.jobId, '300'))
      await expect(
        service.reserve(reservation(four.jobId, '1'))
      ).rejects.toMatchObject({ code: 'provider_daily_budget_exceeded' })

      await expect(
        service.markDispatched(dispatch(first.reservationId))
      ).resolves.toMatchObject({ status: 'dispatched', replayed: false })
      await expect(
        service.markDispatched(dispatch(first.reservationId))
      ).resolves.toMatchObject({ status: 'dispatched', replayed: true })
      await expect(
        service.markDispatched({
          ...dispatch(first.reservationId),
          requestFingerprint: '0'.repeat(64),
        })
      ).rejects.toMatchObject({ code: 'provider_attempt_changed' })
      await expect(
        service.release({
          reservationId: first.reservationId,
          outcomeCode: 'provider_not_dispatched',
        })
      ).rejects.toMatchObject({ code: 'provider_attempt_state_conflict' })
      await expect(
        service.settle(settlement(first.reservationId, '301'))
      ).rejects.toMatchObject({
        code: 'provider_settlement_budget_exceeded',
      })

      await expect(
        service.settle(settlement(first.reservationId, '200'))
      ).resolves.toMatchObject({ status: 'settled', replayed: false })
      await expect(
        service.settle(settlement(first.reservationId, '200'))
      ).resolves.toMatchObject({ status: 'settled', replayed: true })
      await expect(
        service.settle(settlement(first.reservationId, '199'))
      ).rejects.toMatchObject({ code: 'provider_attempt_changed' })

      const [settledProtocol] = await transaction
        .select({
          protocolVersion: cortexAssistantProviderAttempts.protocol_version,
          dispatchKey: cortexAssistantProviderAttempts.dispatch_key,
          requestFingerprint:
            cortexAssistantProviderAttempts.request_fingerprint,
          providerRequestIdHash:
            cortexAssistantProviderAttempts.provider_request_id_hash,
          responseFingerprint:
            cortexAssistantProviderAttempts.response_fingerprint,
        })
        .from(cortexAssistantProviderAttempts)
        .where(eq(cortexAssistantProviderAttempts.id, first.reservationId))
      expect(settledProtocol).toEqual({
        protocolVersion: 1,
        dispatchKey: cortexAssistantProviderDispatchKey(first.reservationId),
        requestFingerprint: 'd'.repeat(64),
        providerRequestIdHash: 'e'.repeat(64),
        responseFingerprint: 'f'.repeat(64),
      })

      await expect(
        service.release({
          reservationId: second.reservationId,
          outcomeCode: 'provider_not_dispatched',
        })
      ).resolves.toMatchObject({
        status: 'released',
        consumedCostMicros: '0',
        replayed: false,
      })
      await expect(
        service.release({
          reservationId: second.reservationId,
          outcomeCode: 'provider_not_dispatched',
        })
      ).resolves.toMatchObject({ replayed: true })

      await expect(
        budgetService(transaction, [], false).release({
          reservationId: third.reservationId,
          outcomeCode: 'gate_closed_before_dispatch',
        })
      ).resolves.toMatchObject({ status: 'released' })

      const failedBeforeDispatch = await service.reserve(
        reservation(six.jobId, '100')
      )
      await expect(
        service.reconcileAttempt(
          failedBeforeDispatch.reservationId,
          'execution_failed'
        )
      ).resolves.toBe(1)
      await expect(
        service.release({
          reservationId: failedBeforeDispatch.reservationId,
          outcomeCode: 'execution_failed_before_dispatch',
        })
      ).resolves.toMatchObject({ status: 'released', replayed: true })

      const replayedDispatch = await service.reserve(
        reservation(seven.jobId, '100')
      )
      await service.markDispatched({
        ...dispatch(replayedDispatch.reservationId),
      })
      await expect(
        service.reconcileAttempt(replayedDispatch.reservationId, 'replayed')
      ).resolves.toBe(1)
      const [reconciledDispatch] = await transaction
        .select({
          status: cortexAssistantProviderAttempts.status,
          outcomeCode: cortexAssistantProviderAttempts.outcome_code,
          providerRequestIdHash:
            cortexAssistantProviderAttempts.provider_request_id_hash,
          responseFingerprint:
            cortexAssistantProviderAttempts.response_fingerprint,
        })
        .from(cortexAssistantProviderAttempts)
        .where(
          eq(
            cortexAssistantProviderAttempts.id,
            replayedDispatch.reservationId
          )
        )
      expect(reconciledDispatch).toEqual({
        status: 'settled',
        outcomeCode: 'replayed_outcome_unknown',
        providerRequestIdHash: null,
        responseFingerprint: null,
      })

      const superseded = await service.reserve(reservation(eight.jobId, '100'))
      await transaction
        .update(cortexAssistantGenerationJobs)
        .set({ attempt_count: 2, updated_at: new Date() })
        .where(eq(cortexAssistantGenerationJobs.id, eight.jobId))
      await expect(
        service.reconcileSupersededAttempts(eight.jobId, 2)
      ).resolves.toBe(1)
      await expect(
        service.release({
          reservationId: superseded.reservationId,
          outcomeCode: 'superseded_before_dispatch',
        })
      ).resolves.toMatchObject({ status: 'released', replayed: true })

      const fifthReservation = await service.reserve(
        reservation(five.jobId, '400')
      )
      expect(fifthReservation).toMatchObject({ reservedCostMicros: '400' })

      await transaction
        .update(cortexAssistantProviderPolicies)
        .set({ enabled: false, updated_at: new Date() })
        .where(eq(cortexAssistantProviderPolicies.tenant_id, tenant.tenantId))
      await expect(
        service.markDispatched(dispatch(fifthReservation.reservationId))
      ).rejects.toMatchObject({ code: 'provider_budget_policy_unavailable' })
      await expect(
        budgetService(transaction, [], false).release({
          reservationId: fifthReservation.reservationId,
          outcomeCode: 'policy_disabled_before_dispatch',
        })
      ).resolves.toMatchObject({ status: 'released' })

      await expect(
        transaction.transaction(async (nested) => {
          await nested
            .update(cortexAssistantProviderPolicies)
            .set({ model: 'changed-model', updated_at: new Date() })
            .where(eq(cortexAssistantProviderPolicies.tenant_id, tenant.tenantId))
        })
      ).rejects.toMatchObject({ code: '23514' })

      const attemptAudit = await transaction
        .select({ action: auditLog.action, diff: auditLog.diff })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenant.tenantId),
            eq(auditLog.entity_type, 'cortex_assistant_provider_attempt'),
            eq(auditLog.entity_id, first.reservationId)
          )
        )
        .orderBy(asc(auditLog.id))
      expect(attemptAudit.map((entry) => entry.action)).toEqual([
        'create',
        'status_change',
        'status_change',
      ])
      expect(JSON.stringify(attemptAudit)).not.toContain('request_hash')

      await expect(
        transaction.transaction(async (nested) => {
          await nested
            .update(cortexAssistantProviderAttempts)
            .set({
              status: 'released',
              consumed_cost_micros: 0,
              outcome_code: 'illegal_reopen',
              dispatched_at: null,
            })
            .where(eq(cortexAssistantProviderAttempts.id, first.reservationId))
        })
      ).rejects.toMatchObject({ code: '23514' })
    })
  })

  it('isolates daily ceilings and gate decisions by derived job tenant', async () => {
    await alwaysRollback(async (transaction) => {
      const tenantOne = await seedTenant(transaction, 'tenant-one')
      const tenantTwo = await seedTenant(transaction, 'tenant-two')
      const jobOne = await seedProcessingJob(transaction, tenantOne, 'tenant-one')
      const jobTwo = await seedProcessingJob(transaction, tenantTwo, 'tenant-two')
      await seedPolicy(transaction, tenantOne.tenantId, 500, 500)
      await seedPolicy(transaction, tenantTwo.tenantId, 500, 500)

      await expect(
        budgetService(transaction, [tenantOne.tenantId]).reserve(
          reservation(jobOne.jobId, '500')
        )
      ).resolves.toMatchObject({ reservedCostMicros: '500' })
      await expect(
        budgetService(transaction, [tenantOne.tenantId]).reserve(
          reservation(jobTwo.jobId, '500')
        )
      ).rejects.toMatchObject({ code: 'provider_budget_disabled' })
      await expect(
        budgetService(transaction, [tenantOne.tenantId, tenantTwo.tenantId]).reserve(
          reservation(jobTwo.jobId, '500')
        )
      ).resolves.toMatchObject({ reservedCostMicros: '500' })

      const rows = await transaction
        .select({ tenantId: cortexAssistantProviderAttempts.tenant_id })
        .from(cortexAssistantProviderAttempts)
      expect(rows.filter((row) => row.tenantId === tenantOne.tenantId)).toHaveLength(1)
      expect(rows.filter((row) => row.tenantId === tenantTwo.tenantId)).toHaveLength(1)
    })
  })

  it('opens on failures, permits one cooldown probe, reports health, and closes on success', async () => {
    await alwaysRollback(async (transaction) => {
      const tenant = await seedTenant(transaction, 'circuit')
      const jobs = await Promise.all(
        [
          'failure-one',
          'failure-two',
          'failure-three',
          'probe',
          'blocked-probe',
        ].map((label) => seedProcessingJob(transaction, tenant, label))
      )
      const [failureOne, failureTwo, failureThree, probe, blockedProbe] = jobs
      if (
        !failureOne ||
        !failureTwo ||
        !failureThree ||
        !probe ||
        !blockedProbe
      ) {
        throw new Error('Provider circuit job fixture missing')
      }
      const policyId = await seedPolicy(transaction, tenant.tenantId, 500, 5_000, {
        failureThreshold: 3,
        failureWindowSeconds: 60,
        cooldownSeconds: 60,
      })
      const now = Date.now()
      await seedSettledAttempt(
        transaction,
        failureOne,
        policyId,
        'provider_error:request_failed',
        new Date(now - 90_000),
        500
      )
      await seedSettledAttempt(
        transaction,
        failureTwo,
        policyId,
        'provider_error:timeout',
        new Date(now - 80_000),
        1_000
      )
      await seedSettledAttempt(
        transaction,
        failureThree,
        policyId,
        'provider_error:outcome_unknown',
        new Date(now - 70_000),
        2_000
      )

      const service = budgetService(transaction, [tenant.tenantId])
      const health = new CortexAssistantProviderHealthService(
        transactionBoundDatabase(transaction)
      )
      await expect(
        health.read(
          { provider: 'openai', model: 'gpt-4.1-mini' },
          { tenantId: tenant.tenantId }
        )
      ).resolves.toMatchObject({
        spend: {
          heldMicros: '0',
          consumedMicros: '300',
          remainingMicros: '4700',
        },
        attempts: {
          reserved: 0,
          dispatched: 0,
          succeeded: 0,
          failed: 3,
          outcomeUnknown: 1,
        },
        latencyMs: { p50: 1_000, p95: 2_000, p99: 2_000 },
        circuit: {
          state: 'half_open',
          failureCount: 3,
          probeInFlight: false,
        },
      })

      const probeReservation = await service.reserve(
        reservation(probe.jobId, '100')
      )
      await expect(
        service.reserve(reservation(blockedProbe.jobId, '100'))
      ).rejects.toMatchObject({
        code: 'provider_circuit_probe_in_progress',
      })
      await service.markDispatched(dispatch(probeReservation.reservationId))
      await service.settle(settlement(probeReservation.reservationId, '50'))

      await expect(
        health.read(
          { provider: 'openai', model: 'gpt-4.1-mini' },
          { tenantId: tenant.tenantId }
        )
      ).resolves.toMatchObject({
        attempts: { succeeded: 1, failed: 3 },
        circuit: {
          state: 'closed',
          failureCount: 0,
          retryAt: null,
          probeInFlight: false,
        },
      })
      await expect(
        service.reserve(reservation(blockedProbe.jobId, '100'))
      ).resolves.toMatchObject({ status: 'reserved' })

      const recentTenant = await seedTenant(transaction, 'circuit-open')
      const recentJobs = await Promise.all(
        ['one', 'two', 'three', 'blocked'].map((label) =>
          seedProcessingJob(transaction, recentTenant, label)
        )
      )
      const [recentOne, recentTwo, recentThree, recentBlocked] = recentJobs
      if (!recentOne || !recentTwo || !recentThree || !recentBlocked) {
        throw new Error('Open circuit fixture missing')
      }
      const recentPolicyId = await seedPolicy(
        transaction,
        recentTenant.tenantId,
        500,
        5_000,
        {
          failureThreshold: 3,
          failureWindowSeconds: 3_600,
          cooldownSeconds: 600,
        }
      )
      for (const [index, recentJob] of [
        recentOne,
        recentTwo,
        recentThree,
      ].entries()) {
        await seedSettledAttempt(
          transaction,
          recentJob,
          recentPolicyId,
          'provider_error:timeout',
          new Date(now - (index + 1) * 5_000)
        )
      }
      await expect(
        budgetService(transaction, [recentTenant.tenantId]).reserve(
          reservation(recentBlocked.jobId, '100')
        )
      ).rejects.toMatchObject({ code: 'provider_circuit_open' })
      await expect(
        health.read(
          { provider: 'openai', model: 'gpt-4.1-mini' },
          { tenantId: recentTenant.tenantId }
        )
      ).resolves.toMatchObject({
        spend: { consumedMicros: '300' },
        circuit: { state: 'open', failureCount: 3 },
      })
      await expect(
        health.read(
          { provider: 'openai', model: 'gpt-4.1-mini' },
          { tenantId: tenant.tenantId }
        )
      ).resolves.toMatchObject({ circuit: { state: 'closed' } })

      const sparseTenant = await seedTenant(transaction, 'circuit-sparse')
      const sparseJobs = await Promise.all(
        ['one', 'two', 'three', 'allowed'].map((label) =>
          seedProcessingJob(transaction, sparseTenant, label)
        )
      )
      const [sparseOne, sparseTwo, sparseThree, sparseAllowed] = sparseJobs
      if (!sparseOne || !sparseTwo || !sparseThree || !sparseAllowed) {
        throw new Error('Sparse circuit fixture missing')
      }
      const sparsePolicyId = await seedPolicy(
        transaction,
        sparseTenant.tenantId,
        500,
        5_000,
        {
          failureThreshold: 3,
          failureWindowSeconds: 60,
          cooldownSeconds: 600,
        }
      )
      for (const [sparseJob, secondsAgo] of [
        [sparseOne, 180],
        [sparseTwo, 100],
        [sparseThree, 10],
      ] as const) {
        await seedSettledAttempt(
          transaction,
          sparseJob,
          sparsePolicyId,
          'provider_error:timeout',
          new Date(now - secondsAgo * 1_000)
        )
      }
      await expect(
        health.read(
          { provider: 'openai', model: 'gpt-4.1-mini' },
          { tenantId: sparseTenant.tenantId }
        )
      ).resolves.toMatchObject({ circuit: { state: 'closed' } })
      await expect(
        budgetService(transaction, [sparseTenant.tenantId]).reserve(
          reservation(sparseAllowed.jobId, '100')
        )
      ).resolves.toMatchObject({ status: 'reserved' })
    })
  })
})
