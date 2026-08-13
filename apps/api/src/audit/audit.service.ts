import { Injectable } from '@nestjs/common'
import { auditLog } from '@third-code-erp/database/schema'
import { computeDatabaseAuditHash } from '@third-code-erp/shared-types'
import { desc, eq, sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseTransaction } from '../database/database.service'

export interface SemanticAuditParams {
  tenantId: string
  actorId: string | null
  entityType: string
  entityId: string
  action:
    | 'create'
    | 'update'
    | 'delete'
    | 'approve'
    | 'lock'
    | 'unlock'
    | 'stage_change'
    | 'status_change'
    | 'query'
  diff: Record<string, unknown>
}

@Injectable()
export class AuditService {
  async stampActor(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal
  ): Promise<void> {
    await transaction.execute(sql`
      select pg_catalog.set_config(
        'request.jwt.claims',
        pg_catalog.json_build_object(
          'sub',
          ${principal.userId}::uuid,
          'role',
          'authenticated'
        )::text,
        true
      )
    `)
  }

  async writeSemantic(
    transaction: DatabaseTransaction,
    params: SemanticAuditParams
  ): Promise<void> {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${
        'audit_log:' + params.tenantId
      }, 0))`
    )

    const [lastEntry] = await transaction
      .select({ hash: auditLog.hash })
      .from(auditLog)
      .where(eq(auditLog.tenant_id, params.tenantId))
      .orderBy(desc(auditLog.id))
      .limit(1)

    const prevHash = lastEntry?.hash ?? 'genesis'
    const createdAt = new Date()
    const hash = await computeDatabaseAuditHash(prevHash, {
      entity_type: params.entityType,
      entity_id: params.entityId,
      action: params.action,
      created_at: createdAt,
    })

    await transaction.insert(auditLog).values({
      tenant_id: params.tenantId,
      actor_id: params.actorId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      action: params.action,
      diff: params.diff,
      prev_hash: prevHash,
      hash,
      created_at: createdAt,
    })
  }
}
