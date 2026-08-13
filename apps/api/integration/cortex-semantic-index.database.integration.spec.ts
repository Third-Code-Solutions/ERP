import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import {
  auditLog,
  cortexNodes,
  cortexSemanticIndexJobs,
  db,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import type {
  CortexSemanticIndexQueueJob,
  CortexSemanticIndexRecoveryJob,
} from '@third-code-erp/shared-types'
import { Queue, type Job } from 'bullmq'
import { and, asc, eq, inArray } from 'drizzle-orm'
import Redis from 'ioredis'
import { describe, expect, it } from 'vitest'
import type {
  ErpPrincipal,
  ErpRole,
} from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import { redisConnectionOptions } from '../src/config/environment'
import {
  CORTEX_SEMANTIC_INDEX_ATTEMPTS,
  CORTEX_SEMANTIC_INDEX_JOB,
  cortexSemanticIndexTransportJobId,
} from '../src/cortex/cortex-semantic-index.constants'
import {
  CortexSemanticIndexProcessor,
  type CortexSemanticIndexProcessorResult,
} from '../src/cortex/cortex-semantic-index.processor'
import { CortexSemanticIndexJobQueue } from '../src/cortex/cortex-semantic-index.queue'
import { CortexSemanticIndexService } from '../src/cortex/cortex-semantic-index.service'
import { CortexSemanticIndexStateService } from '../src/cortex/cortex-semantic-index.state'
import { CortexSemanticIndexWorkerClient } from '../src/cortex/cortex-semantic-index.worker'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import {
  providerQuotaKey,
  ProviderQuotaService,
} from '../src/observability/provider-quota.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.REDIS_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const command = { maxNodes: 64, costConsent: true } as const
const rollback = Symbol('rollback')

interface SeededTenant {
  tenantId: string
  userId: string
  principal: ErpPrincipal
}

class FakeEmbeddingWorker extends CortexSemanticIndexWorkerClient {
  readonly calls: string[][] = []

  override async embed(texts: string[]): Promise<number[][]> {
    this.calls.push([...texts])
    return texts.map((_text, index) => embeddingVector(index + 1))
  }
}

function embeddingVector(marker = 1): number[] {
  const vector = Array<number>(1_536).fill(0)
  vector[0] = marker
  return vector
}

function configFor(tenantIds: readonly string[]): ConfigService {
  return new ConfigService({
    ERP_CORTEX_SEMANTIC_INDEX_JOBS_ENABLED: true,
    ERP_CORTEX_SEMANTIC_INDEX_JOBS_TENANT_IDS: [...tenantIds],
    ERP_CORTEX_SEMANTIC_INDEX_WORKER_ENABLED: true,
    ERP_CORTEX_SEMANTIC_INDEX_WORKER_TENANT_IDS: [...tenantIds],
    ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_ENABLED: true,
    ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_TENANT_IDS: [...tenantIds],
  })
}

function processorJob(
  jobId: string
): Job<unknown, CortexSemanticIndexProcessorResult, string> {
  return {
    id: cortexSemanticIndexTransportJobId(jobId),
    name: CORTEX_SEMANTIC_INDEX_JOB,
    data: { schemaVersion: 1, jobId },
    attemptsMade: 0,
    opts: { attempts: CORTEX_SEMANTIC_INDEX_ATTEMPTS },
  } as Job<unknown, CortexSemanticIndexProcessorResult, string>
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
  role: ErpRole
): Promise<SeededTenant> {
  const tenantId = randomUUID()
  const userId = randomUUID()
  const suffix = randomUUID().slice(0, 12)
  const email = `cortex-index-${suffix}@integration.test`
  await transaction.insert(tenants).values({
    id: tenantId,
    name: `Cortex index ${role}`,
    slug: `cortex-index-${role}-${suffix}`,
  })
  await transaction.insert(users).values({
    id: userId,
    tenant_id: tenantId,
    email,
    full_name: `Cortex index ${role}`,
    role,
  })
  return {
    tenantId,
    userId,
    principal: { tenantId, userId, role, email },
  }
}

async function markExistingNodesIndexed(
  transaction: DatabaseTransaction,
  tenantId: string
): Promise<void> {
  await transaction
    .update(cortexNodes)
    .set({ embedding: embeddingVector() })
    .where(eq(cortexNodes.tenant_id, tenantId))
}

async function insertIndexNodes(
  transaction: DatabaseTransaction,
  tenant: SeededTenant,
  count: number
): Promise<string[]> {
  const ids = Array.from({ length: count }, () => randomUUID())
  await transaction.insert(cortexNodes).values(
    ids.map((id, index) => ({
      id,
      tenant_id: tenant.tenantId,
      node_type: 'document' as const,
      ref_table: 'cortex_index_integration_fixture',
      ref_id: randomUUID(),
      title: `Cortex integration node ${index + 1}`,
      summary: 'Deterministic disposable indexing evidence',
      created_by: tenant.userId,
    }))
  )
  return ids
}

function createRuntime(
  tenantIds: readonly string[],
  database: DatabaseService
): {
  config: ConfigService
  service: CortexSemanticIndexService
  state: CortexSemanticIndexStateService
} {
  const config = configFor(tenantIds)
  return {
    config,
    service: new CortexSemanticIndexService(
      config,
      database,
      new AuditService()
    ),
    state: new CortexSemanticIndexStateService(database),
  }
}

async function assertRolledBack(tenantIds: readonly string[]): Promise<void> {
  const leaked = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(inArray(tenants.id, [...tenantIds]))
  expect(leaked).toHaveLength(0)
}

suite('Cortex semantic index disposable database integration', () => {
  it('processes at most 64 nodes with one provider call and tenant-safe replay', async () => {
    const tenantIds: string[] = []
    await alwaysRollback(async (transaction) => {
      const owner = await seedTenant(transaction, 'owner')
      const other = await seedTenant(transaction, 'owner')
      tenantIds.push(owner.tenantId, other.tenantId)
      await markExistingNodesIndexed(transaction, owner.tenantId)
      await markExistingNodesIndexed(transaction, other.tenantId)
      const ownerNodeIds = await insertIndexNodes(transaction, owner, 65)
      const [otherNodeId] = await insertIndexNodes(transaction, other, 1)
      if (!otherNodeId) throw new Error('Other-tenant fixture was not created')

      const database = transactionBoundDatabase(transaction)
      const runtime = createRuntime(tenantIds, database)
      const created = await runtime.service.create(
        command,
        owner.principal,
        'cortex-integration-max-64'
      )
      expect(created).toMatchObject({
        created: true,
        status: { status: 'queued', backlogAtRequest: 65 },
      })
      await expect(
        runtime.service.create(
          command,
          owner.principal,
          'cortex-integration-max-64'
        )
      ).resolves.toMatchObject({
        created: false,
        status: { jobId: created.status.jobId },
      })
      await expect(
        runtime.service.create(
          command,
          owner.principal,
          'cortex-integration-second-active'
        )
      ).rejects.toThrow('already active')
      await expect(
        runtime.service.status(created.status.jobId, other.principal)
      ).rejects.toThrow('not found')

      const redis = new Redis(
        redisConnectionOptions(process.env.REDIS_URL as string)
      )
      try {
        const worker = new FakeEmbeddingWorker()
        const processor = new CortexSemanticIndexProcessor(
          runtime.config,
          runtime.state,
          worker,
          new ProviderQuotaService(redis)
        )
        await expect(
          processor.process(processorJob(created.status.jobId))
        ).resolves.toEqual({
          status: 'succeeded',
          jobId: created.status.jobId,
          processedNodes: 64,
        })
        await expect(
          processor.process(processorJob(created.status.jobId))
        ).resolves.toEqual({
          status: 'ignored',
          jobId: created.status.jobId,
        })
        expect(worker.calls).toHaveLength(1)
        expect(worker.calls[0]).toHaveLength(64)

        await expect(
          runtime.service.status(created.status.jobId, owner.principal)
        ).resolves.toMatchObject({
          status: 'succeeded',
          processedNodes: 64,
          attempts: 1,
          providerCalls: 1,
        })
        const ownerNodes = await transaction
          .select({ id: cortexNodes.id, embedding: cortexNodes.embedding })
          .from(cortexNodes)
          .where(inArray(cortexNodes.id, ownerNodeIds))
        expect(
          ownerNodes.filter((node) => node.embedding !== null)
        ).toHaveLength(64)
        expect(
          ownerNodes.filter((node) => node.embedding === null)
        ).toHaveLength(1)
        const [otherNode] = await transaction
          .select({ embedding: cortexNodes.embedding })
          .from(cortexNodes)
          .where(eq(cortexNodes.id, otherNodeId))
          .limit(1)
        expect(otherNode?.embedding).toBeNull()

        const [audit] = await transaction
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, owner.tenantId),
              eq(auditLog.entity_type, 'cortex_semantic_index_job'),
              eq(auditLog.entity_id, created.status.jobId)
            )
          )
          .limit(1)
        expect(audit).toMatchObject({
          actor_id: owner.userId,
          action: 'create',
          diff: {
            maxNodes: 64,
            backlogAtRequest: 65,
            costConsent: true,
            providerCallCeiling: 1,
          },
        })
      } finally {
        await redis.del(
          providerQuotaKey(
            'provider-embedding',
            owner.tenantId,
            owner.userId
          )
        )
        await redis.quit()
      }
    })
    await assertRolledBack(tenantIds)
  }, 30_000)

  it('uses zero provider calls for an empty backlog and fails after role revocation', async () => {
    const tenantIds: string[] = []
    await alwaysRollback(async (transaction) => {
      const admin = await seedTenant(transaction, 'admin')
      tenantIds.push(admin.tenantId)
      await markExistingNodesIndexed(transaction, admin.tenantId)
      const database = transactionBoundDatabase(transaction)
      const runtime = createRuntime(tenantIds, database)
      const worker = new FakeEmbeddingWorker()

      const empty = await runtime.service.create(
        command,
        admin.principal,
        'cortex-integration-empty'
      )
      expect(empty).toMatchObject({
        created: true,
        status: {
          status: 'succeeded',
          backlogAtRequest: 0,
          processedNodes: 0,
          providerCalls: 0,
        },
      })
      expect(worker.calls).toHaveLength(0)

      await insertIndexNodes(transaction, admin, 1)
      const queued = await runtime.service.create(
        command,
        admin.principal,
        'cortex-integration-revoked'
      )
      await transaction
        .update(users)
        .set({ role: 'viewer' })
        .where(
          and(
            eq(users.id, admin.userId),
            eq(users.tenant_id, admin.tenantId)
          )
        )

      const redis = new Redis(
        redisConnectionOptions(process.env.REDIS_URL as string)
      )
      try {
        const processor = new CortexSemanticIndexProcessor(
          runtime.config,
          runtime.state,
          worker,
          new ProviderQuotaService(redis)
        )
        await expect(
          processor.process(processorJob(queued.status.jobId))
        ).resolves.toEqual({
          status: 'ignored',
          jobId: queued.status.jobId,
        })
        const [failed] = await transaction
          .select()
          .from(cortexSemanticIndexJobs)
          .where(eq(cortexSemanticIndexJobs.id, queued.status.jobId))
          .limit(1)
        expect(failed).toMatchObject({
          status: 'failed',
          failure_code: 'permission_revoked',
          provider_call_count: 0,
        })
        expect(worker.calls).toHaveLength(0)
        await expect(
          runtime.service.status(queued.status.jobId, admin.principal)
        ).rejects.toThrow('not permitted')

        const audits = await transaction
          .select({
            id: auditLog.id,
            prevHash: auditLog.prev_hash,
            hash: auditLog.hash,
          })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, admin.tenantId),
              eq(auditLog.entity_type, 'cortex_semantic_index_job')
            )
          )
          .orderBy(asc(auditLog.id))
        expect(audits).toHaveLength(2)
        const tenantAudits = await transaction
          .select({ prevHash: auditLog.prev_hash, hash: auditLog.hash })
          .from(auditLog)
          .where(eq(auditLog.tenant_id, admin.tenantId))
          .orderBy(asc(auditLog.id))
        for (let index = 1; index < tenantAudits.length; index += 1) {
          expect(tenantAudits[index]?.prevHash).toBe(
            tenantAudits[index - 1]?.hash
          )
        }
      } finally {
        await redis.quit()
      }
    })
    await assertRolledBack(tenantIds)
  }, 30_000)

  it('recovers Redis loss before reservation and fails closed after reservation', async () => {
    const tenantIds: string[] = []
    await alwaysRollback(async (transaction) => {
      const owner = await seedTenant(transaction, 'owner')
      tenantIds.push(owner.tenantId)
      await markExistingNodesIndexed(transaction, owner.tenantId)
      await insertIndexNodes(transaction, owner, 1)
      const database = transactionBoundDatabase(transaction)
      const runtime = createRuntime(tenantIds, database)
      const worker = new FakeEmbeddingWorker()
      const redis = new Redis(
        redisConnectionOptions(process.env.REDIS_URL as string)
      )
      const queue = new Queue<
        CortexSemanticIndexQueueJob | CortexSemanticIndexRecoveryJob,
        unknown,
        string
      >(`third-code-erp-cortex-index-${randomUUID()}`, {
        connection: redisConnectionOptions(process.env.REDIS_URL as string),
      })

      try {
        const processor = new CortexSemanticIndexProcessor(
          runtime.config,
          runtime.state,
          worker,
          new ProviderQuotaService(redis)
        )
        const first = await runtime.service.create(
          command,
          owner.principal,
          'cortex-integration-recovery'
        )
        const producer = new CortexSemanticIndexJobQueue(
          queue,
          runtime.state,
          runtime.config
        )
        await expect(producer.enqueue(first.status.jobId)).resolves.toBe(true)
        await expect(
          runtime.state.claim(first.status.jobId)
        ).resolves.toMatchObject({ attempt: 1 })

        await queue.obliterate({ force: true })
        await transaction
          .update(cortexSemanticIndexJobs)
          .set({ updated_at: new Date(Date.now() - 10 * 60_000) })
          .where(eq(cortexSemanticIndexJobs.id, first.status.jobId))
        await expect(producer.enqueuePending([owner.tenantId])).resolves.toBe(1)
        await expect(
          queue.getJob(cortexSemanticIndexTransportJobId(first.status.jobId))
        ).resolves.toBeTruthy()
        await expect(
          processor.process(processorJob(first.status.jobId))
        ).resolves.toMatchObject({
          status: 'succeeded',
          processedNodes: 1,
        })
        const [recovered] = await transaction
          .select()
          .from(cortexSemanticIndexJobs)
          .where(eq(cortexSemanticIndexJobs.id, first.status.jobId))
          .limit(1)
        expect(recovered).toMatchObject({
          status: 'succeeded',
          attempt_count: 2,
          provider_call_count: 1,
          processed_nodes: 1,
        })

        await insertIndexNodes(transaction, owner, 1)
        const unknown = await runtime.service.create(
          command,
          owner.principal,
          'cortex-integration-provider-unknown'
        )
        await expect(
          runtime.state.claim(unknown.status.jobId)
        ).resolves.toBeTruthy()
        await expect(
          runtime.state.reserveProviderCall(unknown.status.jobId)
        ).resolves.toBe(true)
        await transaction
          .update(cortexSemanticIndexJobs)
          .set({ updated_at: new Date(Date.now() - 10 * 60_000) })
          .where(eq(cortexSemanticIndexJobs.id, unknown.status.jobId))
        await expect(
          runtime.state.recoverableJobIds(new Date(), [owner.tenantId])
        ).resolves.not.toContain(unknown.status.jobId)
        const [unknownOutcome] = await transaction
          .select()
          .from(cortexSemanticIndexJobs)
          .where(eq(cortexSemanticIndexJobs.id, unknown.status.jobId))
          .limit(1)
        expect(unknownOutcome).toMatchObject({
          status: 'failed',
          failure_code: 'provider_call_outcome_unknown',
          provider_call_count: 1,
        })

        const [atomicNodeId] = await insertIndexNodes(transaction, owner, 1)
        if (!atomicNodeId) throw new Error('Atomicity fixture was not created')
        const atomic = await runtime.service.create(
          command,
          owner.principal,
          'cortex-integration-atomicity'
        )
        await expect(
          runtime.state.claim(atomic.status.jobId)
        ).resolves.toBeTruthy()
        await expect(
          runtime.state.reserveProviderCall(atomic.status.jobId)
        ).resolves.toBe(true)
        await expect(
          runtime.state.succeed(
            randomUUID(),
            owner.tenantId,
            [atomicNodeId],
            [embeddingVector(9)]
          )
        ).rejects.toThrow('semantic_index_job_not_processing')
        const [atomicNode] = await transaction
          .select({ embedding: cortexNodes.embedding })
          .from(cortexNodes)
          .where(eq(cortexNodes.id, atomicNodeId))
          .limit(1)
        const [atomicJob] = await transaction
          .select()
          .from(cortexSemanticIndexJobs)
          .where(eq(cortexSemanticIndexJobs.id, atomic.status.jobId))
          .limit(1)
        expect(atomicNode?.embedding).toBeNull()
        expect(atomicJob).toMatchObject({
          status: 'processing',
          provider_call_count: 1,
        })
        await runtime.state.fail(atomic.status.jobId, 'integration_cleanup')
        expect(worker.calls).toHaveLength(1)

        const auditRows = await transaction
          .select({
            id: auditLog.id,
            prevHash: auditLog.prev_hash,
            hash: auditLog.hash,
          })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, owner.tenantId),
              eq(auditLog.entity_type, 'cortex_semantic_index_job')
            )
          )
          .orderBy(asc(auditLog.id))
        expect(auditRows).toHaveLength(3)
        const tenantAudits = await transaction
          .select({ prevHash: auditLog.prev_hash, hash: auditLog.hash })
          .from(auditLog)
          .where(eq(auditLog.tenant_id, owner.tenantId))
          .orderBy(asc(auditLog.id))
        for (let index = 1; index < tenantAudits.length; index += 1) {
          expect(tenantAudits[index]?.prevHash).toBe(
            tenantAudits[index - 1]?.hash
          )
        }
      } finally {
        await queue.obliterate({ force: true }).catch(() => undefined)
        await queue.close()
        await redis.del(
          providerQuotaKey(
            'provider-embedding',
            owner.tenantId,
            owner.userId
          )
        )
        await redis.quit()
      }
    })
    await assertRolledBack(tenantIds)
  }, 30_000)
})
