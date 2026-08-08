import { createHash } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { cortexAssistantProviderCircuitAlerts } from '@third-code-erp/database'
import {
  cortexAssistantProviderCircuitAlertEventSchema,
  type CortexAssistantProviderCircuitAlertEvent,
} from '@third-code-erp/shared-types'
import { and, asc, desc, eq, lt, or, sql } from 'drizzle-orm'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import type {
  CortexAssistantProviderCircuitPolicy,
  CortexAssistantProviderCircuitSnapshot,
} from './cortex-assistant-provider-health.query'

export interface CortexAssistantProviderCircuitAlertPolicy
  extends CortexAssistantProviderCircuitPolicy {
  provider: string
  model: string
}

export interface CortexAssistantProviderCircuitAlertSink {
  publish(event: CortexAssistantProviderCircuitAlertEvent): Promise<void>
}

export interface CortexAssistantProviderCircuitAlertObservation {
  event: CortexAssistantProviderCircuitAlertEvent | null
  created: boolean
}

interface AlertRow {
  id: string
  tenant_id: string
  policy_id: string
  source_event_id: string | null
  event_key: string
  event_type: string
  provider: string
  model: string
  failure_count: number
  retry_at: Date | null
  as_of: Date
  status: string
  attempt_count: number
  last_error: string | null
  processing_started_at: Date | null
  delivered_at: Date | null
  created_at: Date
  updated_at: Date
}

function transitionKey(
  policyId: string,
  eventType: 'opened' | 'recovered',
  tripStartedAt: Date | null
): string {
  return createHash('sha256')
    .update(
      `${policyId}|${eventType}|${tripStartedAt?.toISOString() ?? 'none'}`,
      'utf8'
    )
    .digest('hex')
}

function toEvent(row: AlertRow): CortexAssistantProviderCircuitAlertEvent {
  return cortexAssistantProviderCircuitAlertEventSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    policyId: row.policy_id,
    eventKey: row.event_key,
    eventType: row.event_type,
    provider: row.provider,
    model: row.model,
    failureCount: row.failure_count,
    retryAt: row.retry_at?.toISOString() ?? null,
    asOf: row.as_of.toISOString(),
    runbook: 'cortex-provider-circuit',
  })
}

@Injectable()
export class CortexAssistantProviderCircuitAlertService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async observe(
    transaction: DatabaseTransaction,
    policy: CortexAssistantProviderCircuitAlertPolicy,
    circuit: CortexAssistantProviderCircuitSnapshot,
    asOf: Date
  ): Promise<CortexAssistantProviderCircuitAlertObservation> {
    if (circuit.state === 'closed') {
      return this.recordRecovery(transaction, policy, asOf)
    }
    if (!circuit.tripStartedAt || !circuit.retryAt) {
      throw new Error('Provider circuit alert transition evidence is missing')
    }

    const eventKey = transitionKey(policy.id, 'opened', circuit.tripStartedAt)
    const existing = await this.findByEventKey(
      transaction,
      policy.tenantId,
      eventKey
    )
    if (existing) return { event: toEvent(existing), created: false }

    const [created] = await transaction
      .insert(cortexAssistantProviderCircuitAlerts)
      .values({
        tenant_id: policy.tenantId,
        policy_id: policy.id,
        event_key: eventKey,
        event_type: 'opened',
        provider: policy.provider,
        model: policy.model,
        failure_count: circuit.failureCount,
        retry_at: circuit.retryAt,
        as_of: asOf,
      })
      .onConflictDoNothing({
        target: [
          cortexAssistantProviderCircuitAlerts.tenant_id,
          cortexAssistantProviderCircuitAlerts.event_key,
        ],
      })
      .returning()
    const event = created
      ? toEvent(created as unknown as AlertRow)
      : await this.eventByKeyOrThrow(transaction, policy.tenantId, eventKey)
    if (created) await this.auditCreated(transaction, event)
    return { event, created: Boolean(created) }
  }

  async deliverPending(
    sink: CortexAssistantProviderCircuitAlertSink,
    limit = 100
  ): Promise<{ delivered: number; failed: number }> {
    let delivered = 0
    let failed = 0
    const boundedLimit = Math.max(1, Math.min(limit, 100))
    for (let index = 0; index < boundedLimit; index += 1) {
      const claimed = await this.claimOne()
      if (!claimed) break
      try {
        await sink.publish(claimed)
        await this.markDelivered(claimed.id)
        delivered += 1
      } catch {
        await this.markFailed(claimed.id)
        failed += 1
        break
      }
    }
    return { delivered, failed }
  }

  private async recordRecovery(
    transaction: DatabaseTransaction,
    policy: CortexAssistantProviderCircuitAlertPolicy,
    asOf: Date
  ): Promise<CortexAssistantProviderCircuitAlertObservation> {
    const [opened] = await transaction
      .select()
      .from(cortexAssistantProviderCircuitAlerts)
      .where(
        and(
          eq(cortexAssistantProviderCircuitAlerts.tenant_id, policy.tenantId),
          eq(cortexAssistantProviderCircuitAlerts.policy_id, policy.id),
          eq(cortexAssistantProviderCircuitAlerts.event_type, 'opened')
        )
      )
      .orderBy(desc(cortexAssistantProviderCircuitAlerts.created_at))
      .limit(1)
      .for('update')
    if (!opened) return { event: null, created: false }

    const [existing] = await transaction
      .select()
      .from(cortexAssistantProviderCircuitAlerts)
      .where(
        and(
          eq(cortexAssistantProviderCircuitAlerts.tenant_id, policy.tenantId),
          eq(
            cortexAssistantProviderCircuitAlerts.source_event_id,
            opened.id
          ),
          eq(cortexAssistantProviderCircuitAlerts.event_type, 'recovered')
        )
      )
      .limit(1)
    if (existing) return { event: toEvent(existing), created: false }

    const eventKey = createHash('sha256')
      .update(`${policy.id}|recovered|${opened.event_key}`, 'utf8')
      .digest('hex')
    const [created] = await transaction
      .insert(cortexAssistantProviderCircuitAlerts)
      .values({
        tenant_id: policy.tenantId,
        policy_id: policy.id,
        source_event_id: opened.id,
        event_key: eventKey,
        event_type: 'recovered',
        provider: policy.provider,
        model: policy.model,
        failure_count: 0,
        retry_at: null,
        as_of: asOf,
      })
      .onConflictDoNothing({
        target: [
          cortexAssistantProviderCircuitAlerts.tenant_id,
          cortexAssistantProviderCircuitAlerts.event_key,
        ],
      })
      .returning()
    const event = created
      ? toEvent(created as unknown as AlertRow)
      : await this.eventByKeyOrThrow(transaction, policy.tenantId, eventKey)
    if (created) await this.auditCreated(transaction, event)
    return { event, created: Boolean(created) }
  }

  private async findByEventKey(
    transaction: DatabaseTransaction,
    tenantId: string,
    eventKey: string
  ): Promise<AlertRow | null> {
    const [row] = await transaction
      .select()
      .from(cortexAssistantProviderCircuitAlerts)
      .where(
        and(
          eq(cortexAssistantProviderCircuitAlerts.tenant_id, tenantId),
          eq(cortexAssistantProviderCircuitAlerts.event_key, eventKey)
        )
      )
      .limit(1)
    return (row as unknown as AlertRow | undefined) ?? null
  }

  private async eventByKeyOrThrow(
    transaction: DatabaseTransaction,
    tenantId: string,
    eventKey: string
  ): Promise<CortexAssistantProviderCircuitAlertEvent> {
    const row = await this.findByEventKey(transaction, tenantId, eventKey)
    if (!row) throw new Error('Provider circuit alert event disappeared')
    return toEvent(row)
  }

  private async auditCreated(
    transaction: DatabaseTransaction,
    event: CortexAssistantProviderCircuitAlertEvent
  ): Promise<void> {
    await this.audit.writeSemantic(transaction, {
      tenantId: event.tenantId,
      actorId: null,
      entityType: 'cortex_assistant_provider_circuit_alert',
      entityId: event.id,
      action: 'create',
      diff: {
        event_key: event.eventKey,
        event_type: event.eventType,
        provider: event.provider,
        model: event.model,
        failure_count: event.failureCount,
        retry_at: event.retryAt,
        runbook: event.runbook,
      },
    })
  }

  private async claimOne(): Promise<CortexAssistantProviderCircuitAlertEvent | null> {
    const staleBefore = new Date(Date.now() - 5 * 60_000)
    return this.database.client.transaction(async (transaction) => {
      const [row] = await transaction
        .select()
        .from(cortexAssistantProviderCircuitAlerts)
        .where(
          or(
            eq(cortexAssistantProviderCircuitAlerts.status, 'pending'),
            and(
              eq(cortexAssistantProviderCircuitAlerts.status, 'processing'),
              lt(cortexAssistantProviderCircuitAlerts.updated_at, staleBefore)
            ),
            eq(cortexAssistantProviderCircuitAlerts.status, 'failed')
          )
        )
        .orderBy(asc(cortexAssistantProviderCircuitAlerts.created_at))
        .limit(1)
        .for('update')
      if (!row) return null
      const now = new Date()
      const [updated] = await transaction
        .update(cortexAssistantProviderCircuitAlerts)
        .set({
          status: 'processing',
          attempt_count: sql`${cortexAssistantProviderCircuitAlerts.attempt_count} + 1`,
          processing_started_at: now,
          delivered_at: null,
          last_error: null,
          updated_at: now,
        })
        .where(eq(cortexAssistantProviderCircuitAlerts.id, row.id))
        .returning()
      return updated
        ? toEvent(updated as unknown as AlertRow)
        : null
    })
  }

  private async markDelivered(eventId: string): Promise<void> {
    const now = new Date()
    await this.database.client
      .update(cortexAssistantProviderCircuitAlerts)
      .set({
        status: 'delivered',
        processing_started_at: null,
        delivered_at: now,
        updated_at: now,
        last_error: null,
      })
      .where(
        and(
          eq(cortexAssistantProviderCircuitAlerts.id, eventId),
          eq(cortexAssistantProviderCircuitAlerts.status, 'processing')
        )
      )
  }

  private async markFailed(eventId: string): Promise<void> {
    const now = new Date()
    await this.database.client
      .update(cortexAssistantProviderCircuitAlerts)
      .set({
        status: 'failed',
        processing_started_at: null,
        delivered_at: null,
        last_error: 'sink_failed',
        updated_at: now,
      })
      .where(
        and(
          eq(cortexAssistantProviderCircuitAlerts.id, eventId),
          eq(cortexAssistantProviderCircuitAlerts.status, 'processing')
        )
      )
  }
}
