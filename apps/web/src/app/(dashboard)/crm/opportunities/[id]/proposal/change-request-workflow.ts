import { createHash } from 'node:crypto'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import {
  changeLogs,
  changeRequestCreateRequests,
  changeRequests,
  designFileVersions,
  designFiles,
  opportunities,
  type Database,
} from '@third-code-erp/database'
import { writeAuditLogInTransaction } from '@/lib/audit'

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export type ChangeRequestPriority = 'minor' | 'major'

export type CreateChangeRequestRecordInput = {
  tenantId: string
  actorId: string
  opportunityId: string
  requestedByName: string
  description: string
  priority: ChangeRequestPriority
  affectedDesignFileId: string | null
  idempotencyKey: string
}

export type ChangeRequestRecordResult = {
  error?: string
  changeRequestId?: string
  replayed?: boolean
}

export type ResolveChangeRequestRecordInput = {
  tenantId: string
  actorId: string
  changeRequestId: string
  resolutionNote: string
}

export type ResolveChangeRequestRecordResult = {
  error?: string
  opportunityId?: string
  alreadyResolved?: boolean
}

export function hashChangeRequestInput(
  input: Pick<
    CreateChangeRequestRecordInput,
    | 'opportunityId'
    | 'requestedByName'
    | 'description'
    | 'priority'
    | 'affectedDesignFileId'
  >,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        opportunity_id: input.opportunityId,
        requested_by_name: input.requestedByName,
        description: input.description,
        priority: input.priority,
        affected_design_file_id: input.affectedDesignFileId,
      }),
      'utf8',
    )
    .digest('hex')
}

export async function createChangeRequestRecord(
  tx: DatabaseTransaction,
  input: CreateChangeRequestRecordInput,
): Promise<ChangeRequestRecordResult> {
  const requestHash = hashChangeRequestInput(input)
  const lockName = 'change-request:' + input.tenantId + ':' + input.idempotencyKey
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${lockName}, 0))`,
  )

  const [existingRequest] = await tx
    .select({
      request_hash: changeRequestCreateRequests.request_hash,
      state: changeRequestCreateRequests.state,
      change_request_id: changeRequestCreateRequests.change_request_id,
    })
    .from(changeRequestCreateRequests)
    .where(
      and(
        eq(changeRequestCreateRequests.tenant_id, input.tenantId),
        eq(changeRequestCreateRequests.idempotency_key, input.idempotencyKey),
      ),
    )
    .limit(1)

  if (existingRequest) {
    if (existingRequest.request_hash !== requestHash) {
      return { error: 'This retry key was already used for different request data.' }
    }
    if (existingRequest.state === 'succeeded' && existingRequest.change_request_id) {
      return { changeRequestId: existingRequest.change_request_id, replayed: true }
    }
    return { error: 'This change request is already being processed. Retry shortly.' }
  }

  const [opportunity] = await tx
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.id, input.opportunityId),
        eq(opportunities.tenant_id, input.tenantId),
      ),
    )
    .limit(1)
  if (!opportunity) return { error: 'Opportunity not found' }

  let designFileVersionId: string | null = null
  if (input.affectedDesignFileId) {
    const [design] = await tx
      .select({ id: designFiles.id })
      .from(designFiles)
      .where(
        and(
          eq(designFiles.id, input.affectedDesignFileId),
          eq(designFiles.tenant_id, input.tenantId),
          eq(designFiles.opportunity_id, input.opportunityId),
        ),
      )
      .limit(1)
    if (!design) return { error: 'Affected design file not found' }

    const [latestVersion] = await tx
      .select({ id: designFileVersions.id })
      .from(designFileVersions)
      .where(
        and(
          eq(designFileVersions.design_file_id, design.id),
          eq(designFileVersions.tenant_id, input.tenantId),
        ),
      )
      .orderBy(desc(designFileVersions.version))
      .limit(1)
    if (!latestVersion) {
      return {
        error: 'Upload a design version before linking a change request to this file.',
      }
    }
    designFileVersionId = latestVersion.id
  }

  const [ledger] = await tx
    .insert(changeRequestCreateRequests)
    .values({
      tenant_id: input.tenantId,
      idempotency_key: input.idempotencyKey,
      request_hash: requestHash,
      state: 'processing',
      created_by: input.actorId,
    })
    .returning({ id: changeRequestCreateRequests.id })
  if (!ledger) throw new Error('Change request idempotency ledger was not created')

  const [created] = await tx
    .insert(changeRequests)
    .values({
      tenant_id: input.tenantId,
      opportunity_id: input.opportunityId,
      requested_by_name: input.requestedByName,
      description: input.description,
      priority: input.priority,
      affected_design_file_id: input.affectedDesignFileId,
    })
    .returning({ id: changeRequests.id })
  if (!created) throw new Error('Change request was not created')

  const [createdLog] = await tx
    .insert(changeLogs)
    .values({
      tenant_id: input.tenantId,
      change_request_id: created.id,
      design_file_version_id: designFileVersionId,
      event_type: 'created',
      note: input.description,
      created_by: input.actorId,
    })
    .returning({ id: changeLogs.id })
  if (!createdLog) throw new Error('Change request log was not created')

  await tx
    .update(changeRequestCreateRequests)
    .set({
      state: 'succeeded',
      change_request_id: created.id,
      result: { change_request_id: created.id },
      completed_at: new Date(),
    })
    .where(eq(changeRequestCreateRequests.id, ledger.id))

  await writeAuditLogInTransaction(tx, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    entityType: 'change_request',
    entityId: created.id,
    action: 'create',
    diff: {
      priority: input.priority,
      description: input.description,
      affected_design_file_id: input.affectedDesignFileId,
      design_file_version_id: designFileVersionId,
    },
  })

  await writeAuditLogInTransaction(tx, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    entityType: 'change_log',
    entityId: createdLog.id,
    action: 'create',
    diff: {
      change_request_id: created.id,
      event_type: 'created',
      design_file_version_id: designFileVersionId,
    },
  })

  return { changeRequestId: created.id, replayed: false }
}

export async function resolveChangeRequestRecord(
  tx: DatabaseTransaction,
  input: ResolveChangeRequestRecordInput,
): Promise<ResolveChangeRequestRecordResult> {
  const [request] = await tx
    .select({
      id: changeRequests.id,
      opportunity_id: changeRequests.opportunity_id,
      resolved_at: changeRequests.resolved_at,
    })
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.id, input.changeRequestId),
        eq(changeRequests.tenant_id, input.tenantId),
      ),
    )
    .limit(1)
  if (!request) return { error: 'Change request not found.' }
  if (request.resolved_at) {
    return { opportunityId: request.opportunity_id, alreadyResolved: true }
  }

  const [updated] = await tx
    .update(changeRequests)
    .set({ resolved_at: new Date(), resolved_by: input.actorId })
    .where(
      and(
        eq(changeRequests.id, input.changeRequestId),
        eq(changeRequests.tenant_id, input.tenantId),
        isNull(changeRequests.resolved_at),
      ),
    )
    .returning({ id: changeRequests.id })
  if (!updated) return { opportunityId: request.opportunity_id, alreadyResolved: true }

  const [createdLog] = await tx
    .select({ design_file_version_id: changeLogs.design_file_version_id })
    .from(changeLogs)
    .where(
      and(
        eq(changeLogs.change_request_id, input.changeRequestId),
        eq(changeLogs.tenant_id, input.tenantId),
        eq(changeLogs.event_type, 'created'),
      ),
    )
    .orderBy(desc(changeLogs.created_at))
    .limit(1)

  const [resolutionLog] = await tx
    .insert(changeLogs)
    .values({
      tenant_id: input.tenantId,
      change_request_id: input.changeRequestId,
      design_file_version_id: createdLog?.design_file_version_id ?? null,
      event_type: 'resolved',
      note: input.resolutionNote || null,
      created_by: input.actorId,
    })
    .returning({ id: changeLogs.id })
  if (!resolutionLog) throw new Error('Change request resolution log was not created')

  await writeAuditLogInTransaction(tx, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    entityType: 'change_request',
    entityId: input.changeRequestId,
    action: 'status_change',
    diff: { resolved: true, resolution_note: input.resolutionNote || null },
  })

  await writeAuditLogInTransaction(tx, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    entityType: 'change_log',
    entityId: resolutionLog.id,
    action: 'create',
    diff: {
      change_request_id: input.changeRequestId,
      event_type: 'resolved',
      resolution_note: input.resolutionNote || null,
    },
  })

  return { opportunityId: request.opportunity_id, alreadyResolved: false }
}
