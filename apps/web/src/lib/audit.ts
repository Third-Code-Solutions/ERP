import { db, type Database } from '@third-code-erp/database'
import { auditLog } from '@third-code-erp/database/schema'
import { computeHash, computeDiff } from '@third-code-erp/shared-types'
import { desc, eq, sql } from 'drizzle-orm'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'lock'
  | 'unlock'
  | 'stage_change'
  | 'status_change'
  | 'query'

export interface WriteAuditParams {
  tenantId: string
  actorId: string | null
  entityType: string
  entityId: string
  action: AuditAction
  diff?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export async function writeAuditLogInTransaction(
  tx: DatabaseTransaction,
  params: WriteAuditParams
): Promise<void> {
  const {
    tenantId,
    actorId,
    entityType,
    entityId,
    action,
    diff = {},
    ipAddress,
    userAgent,
  } = params

  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${'audit_log:' + tenantId}, 0))`
  )

  const [lastEntry] = await tx
    .select({ hash: auditLog.hash })
    .from(auditLog)
    .where(eq(auditLog.tenant_id, tenantId))
    .orderBy(desc(auditLog.id))
    .limit(1)

  const prevHash = lastEntry?.hash ?? 'genesis'
  const now = new Date()
  const hash = await computeHash(prevHash, {
    entity_type: entityType,
    entity_id: entityId,
    action,
    diff,
    created_at: now.toISOString(),
  })

  await tx.insert(auditLog).values({
    tenant_id: tenantId,
    actor_id: actorId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    diff,
    prev_hash: prevHash,
    hash,
    ip_address: ipAddress,
    user_agent: userAgent,
    created_at: now,
  })
}

export async function writeAuditLog(params: WriteAuditParams): Promise<void> {
  await db.transaction(async (tx) => {
    await writeAuditLogInTransaction(tx, params)
  })
}

export { computeDiff }
