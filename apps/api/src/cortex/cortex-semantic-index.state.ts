import { Injectable } from '@nestjs/common'
import {
  cortexEmbeddingText,
  cortexNodes,
  cortexSemanticIndexJobs,
  users,
} from '@third-code-erp/database'
import { CORTEX_SEMANTIC_INDEX_MAX_ATTEMPTS } from '@third-code-erp/shared-types'
import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpRole } from '../auth/current-principal.decorator'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import { CORTEX_SEMANTIC_INDEX_RECOVERY_BATCH_SIZE } from './cortex-semantic-index.constants'

export interface CortexSemanticIndexNodeClaim {
  id: string
  text: string
}

export interface ClaimedCortexSemanticIndexJob {
  jobId: string
  tenantId: string
  requestedBy: string
  role: ErpRole
  email: string
  attempt: number
  nodes: CortexSemanticIndexNodeClaim[]
}

function boundedFailureCode(code: string): string {
  const normalized = code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, '_')
    .slice(0, 100)
  return normalized || 'semantic_index_failed'
}

/** PostgreSQL-backed state machine. Redis delivery never becomes authority. */
@Injectable()
export class CortexSemanticIndexStateService {
  constructor(private readonly database: DatabaseService) {}

  async claim(jobId: string): Promise<ClaimedCortexSemanticIndexJob | null> {
    return this.database.client.transaction(async (transaction) => {
      const [row] = await transaction
        .select({
          jobId: cortexSemanticIndexJobs.id,
          tenantId: cortexSemanticIndexJobs.tenant_id,
          requestedBy: cortexSemanticIndexJobs.requested_by,
          status: cortexSemanticIndexJobs.status,
          maxNodes: cortexSemanticIndexJobs.max_nodes,
          attempts: cortexSemanticIndexJobs.attempt_count,
          providerCalls: cortexSemanticIndexJobs.provider_call_count,
          role: users.role,
          email: users.email,
        })
        .from(cortexSemanticIndexJobs)
        .innerJoin(
          users,
          and(
            eq(users.id, cortexSemanticIndexJobs.requested_by),
            eq(users.tenant_id, cortexSemanticIndexJobs.tenant_id)
          )
        )
        .where(eq(cortexSemanticIndexJobs.id, jobId))
        .limit(1)
        .for('update')

      if (!row || row.status === 'succeeded' || row.status === 'failed') {
        return null
      }
      const role = row.role as ErpRole
      if (!roleHasCapability(role, 'cortex.index.manage')) {
        await this.failWithin(
          transaction,
          row.jobId,
          'permission_revoked'
        )
        return null
      }
      if (row.providerCalls > 0) {
        await this.failWithin(
          transaction,
          row.jobId,
          'provider_call_outcome_unknown'
        )
        return null
      }
      if (row.attempts >= CORTEX_SEMANTIC_INDEX_MAX_ATTEMPTS) {
        await this.failWithin(transaction, row.jobId, 'attempt_limit')
        return null
      }

      const attempt = row.attempts + 1
      await transaction
        .update(cortexSemanticIndexJobs)
        .set({
          status: 'processing',
          attempt_count: attempt,
          failure_code: null,
          completed_at: null,
          updated_at: new Date(),
        })
        .where(eq(cortexSemanticIndexJobs.id, row.jobId))

      const nodes = await transaction
        .select({
          id: cortexNodes.id,
          nodeType: cortexNodes.node_type,
          title: cortexNodes.title,
          summary: cortexNodes.summary,
        })
        .from(cortexNodes)
        .where(
          and(
            eq(cortexNodes.tenant_id, row.tenantId),
            isNull(cortexNodes.valid_to),
            isNull(cortexNodes.embedding)
          )
        )
        .orderBy(desc(cortexNodes.recorded_at))
        .limit(row.maxNodes)

      if (nodes.length === 0) {
        await transaction
          .update(cortexSemanticIndexJobs)
          .set({
            status: 'succeeded',
            processed_nodes: 0,
            failure_code: null,
            completed_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(cortexSemanticIndexJobs.id, row.jobId))
        return null
      }

      return {
        jobId: row.jobId,
        tenantId: row.tenantId,
        requestedBy: row.requestedBy,
        role,
        email: row.email,
        attempt,
        nodes: nodes.map((node) => ({
          id: node.id,
          text: cortexEmbeddingText({
            node_type: node.nodeType,
            title: node.title,
            summary: node.summary,
          }),
        })),
      }
    })
  }

  async reserveProviderCall(jobId: string): Promise<boolean> {
    const [reserved] = await this.database.client
      .update(cortexSemanticIndexJobs)
      .set({ provider_call_count: 1, updated_at: new Date() })
      .where(
        and(
          eq(cortexSemanticIndexJobs.id, jobId),
          eq(cortexSemanticIndexJobs.status, 'processing'),
          eq(cortexSemanticIndexJobs.provider_call_count, 0)
        )
      )
      .returning({ id: cortexSemanticIndexJobs.id })
    return Boolean(reserved)
  }

  async succeed(
    jobId: string,
    tenantId: string,
    nodeIds: readonly string[],
    vectors: readonly number[][]
  ): Promise<number> {
    if (
      nodeIds.length === 0 ||
      nodeIds.length > 64 ||
      vectors.length !== nodeIds.length ||
      vectors.some((vector) => vector.length !== 1_536)
    ) {
      throw new Error('semantic_index_result_out_of_bounds')
    }

    return this.database.client.transaction(async (transaction) => {
      let processed = 0
      for (let index = 0; index < nodeIds.length; index += 1) {
        const nodeId = nodeIds[index]
        const vector = vectors[index]
        if (!nodeId || !vector) continue
        const [updated] = await transaction
          .update(cortexNodes)
          .set({ embedding: vector, last_verified_at: new Date() })
          .where(
            and(
              eq(cortexNodes.id, nodeId),
              eq(cortexNodes.tenant_id, tenantId),
              isNull(cortexNodes.valid_to),
              isNull(cortexNodes.embedding)
            )
          )
          .returning({ id: cortexNodes.id })
        if (updated) processed += 1
      }

      const [completed] = await transaction
        .update(cortexSemanticIndexJobs)
        .set({
          status: 'succeeded',
          processed_nodes: processed,
          failure_code: null,
          completed_at: new Date(),
          updated_at: new Date(),
        })
        .where(
          and(
            eq(cortexSemanticIndexJobs.id, jobId),
            eq(cortexSemanticIndexJobs.tenant_id, tenantId),
            eq(cortexSemanticIndexJobs.status, 'processing'),
            eq(cortexSemanticIndexJobs.provider_call_count, 1)
          )
        )
        .returning({ id: cortexSemanticIndexJobs.id })
      if (!completed) throw new Error('semantic_index_job_not_processing')
      return processed
    })
  }

  async fail(jobId: string, failureCode: string): Promise<boolean> {
    const [failed] = await this.database.client
      .update(cortexSemanticIndexJobs)
      .set({
        status: 'failed',
        failure_code: boundedFailureCode(failureCode),
        completed_at: new Date(),
        updated_at: new Date(),
      })
      .where(
        and(
          eq(cortexSemanticIndexJobs.id, jobId),
          or(
            eq(cortexSemanticIndexJobs.status, 'queued'),
            eq(cortexSemanticIndexJobs.status, 'processing')
          )
        )
      )
      .returning({ id: cortexSemanticIndexJobs.id })
    return Boolean(failed)
  }

  async recoverableJobIds(
    before: Date,
    tenantIds: readonly string[]
  ): Promise<string[]> {
    const scoped = [...new Set(tenantIds)]
    if (scoped.length === 0) return []

    return this.database.client.transaction(async (transaction) => {
      await transaction
        .update(cortexSemanticIndexJobs)
        .set({ status: 'queued', completed_at: null, updated_at: new Date() })
        .where(
          and(
            eq(cortexSemanticIndexJobs.status, 'processing'),
            eq(cortexSemanticIndexJobs.provider_call_count, 0),
            lt(cortexSemanticIndexJobs.updated_at, before),
            inArray(cortexSemanticIndexJobs.tenant_id, scoped)
          )
        )
      await transaction
        .update(cortexSemanticIndexJobs)
        .set({
          status: 'failed',
          failure_code: 'provider_call_outcome_unknown',
          completed_at: new Date(),
          updated_at: new Date(),
        })
        .where(
          and(
            eq(cortexSemanticIndexJobs.status, 'processing'),
            eq(cortexSemanticIndexJobs.provider_call_count, 1),
            lt(cortexSemanticIndexJobs.updated_at, before),
            inArray(cortexSemanticIndexJobs.tenant_id, scoped)
          )
        )

      const rows = await transaction
        .select({ id: cortexSemanticIndexJobs.id })
        .from(cortexSemanticIndexJobs)
        .where(
          and(
            eq(cortexSemanticIndexJobs.status, 'queued'),
            inArray(cortexSemanticIndexJobs.tenant_id, scoped)
          )
        )
        .orderBy(cortexSemanticIndexJobs.updated_at)
        .limit(CORTEX_SEMANTIC_INDEX_RECOVERY_BATCH_SIZE)
      return rows.map((row) => row.id)
    })
  }

  private async failWithin(
    transaction: DatabaseTransaction,
    jobId: string,
    failureCode: string
  ): Promise<void> {
    await transaction
      .update(cortexSemanticIndexJobs)
      .set({
        status: 'failed',
        failure_code: boundedFailureCode(failureCode),
        completed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(cortexSemanticIndexJobs.id, jobId))
  }
}
