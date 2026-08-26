import { db, type Database } from '@third-code-erp/database'
import { platformAuditLog } from '@third-code-erp/database/schema'

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export interface WritePlatformAuditParams {
  actorId: string | null
  actorEmail: string | null
  entityType: string
  entityId: string
  action: string
  details?: Record<string, boolean | number | string | null>
}

export async function writePlatformAuditLogInTransaction(
  tx: DatabaseTransaction,
  params: WritePlatformAuditParams
): Promise<void> {
  await tx.insert(platformAuditLog).values({
    actor_id: params.actorId,
    actor_email: params.actorEmail,
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    details: params.details ?? {},
  })
}

export async function writePlatformAuditLog(
  params: WritePlatformAuditParams
): Promise<void> {
  await db.transaction(async (tx) => {
    await writePlatformAuditLogInTransaction(tx, params)
  })
}
