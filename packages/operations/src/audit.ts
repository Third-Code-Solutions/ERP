import type { Database } from '@third-code-erp/database'
import { auditLog } from '@third-code-erp/database/schema'
import { computeDatabaseAuditHash } from '@third-code-erp/shared-types'
import { desc, eq, sql } from 'drizzle-orm'

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export async function writeAwardAuditInTransaction(
  tx: DatabaseTransaction,
  params: {
    tenantId: string
    actorId: string | null
    entityType: string
    entityId: string
    action: 'create'
    diff: Record<string, unknown>
  }
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${'audit_log:' + params.tenantId}, 0))`
  )
  const [lastEntry] = await tx
    .select({ hash: auditLog.hash })
    .from(auditLog)
    .where(eq(auditLog.tenant_id, params.tenantId))
    .orderBy(desc(auditLog.id))
    .limit(1)
  const createdAt = new Date()
  const prevHash = lastEntry?.hash ?? 'genesis'
  const hash = await computeDatabaseAuditHash(prevHash, {
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    created_at: createdAt,
  })
  await tx.insert(auditLog).values({
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
