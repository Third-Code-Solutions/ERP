import { db } from '@buildops/database'
import { auditLog } from '@buildops/database/schema'
import { computeHash, computeDiff } from '@buildops/shared-types'
import { desc, eq } from 'drizzle-orm'

export type AuditAction = 'create' | 'update' | 'delete' | 'approve' | 'lock' | 'unlock' | 'stage_change' | 'status_change'

interface WriteAuditParams {
  tenantId: string
  actorId: string
  entityType: string
  entityId: string
  action: AuditAction
  diff?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

export async function writeAuditLog(params: WriteAuditParams): Promise<void> {
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

  // Get the previous hash for this tenant's chain
  const [lastEntry] = await db
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

  await db.insert(auditLog).values({
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

export { computeDiff }
