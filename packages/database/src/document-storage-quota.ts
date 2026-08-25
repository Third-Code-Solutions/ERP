import { sql, type SQL } from 'drizzle-orm'

import type { Database } from './client'
import {
  documents,
  documentUploadReservations,
  projects,
} from './schema'

type ExistingDatabaseTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0]

/** The narrow transaction surface required by project storage serialization. */
export type DocumentStorageQuotaTransaction = Readonly<{
  execute(query: SQL): PromiseLike<readonly unknown[]>
  rollback: ExistingDatabaseTransaction['rollback']
}>

export type DocumentStorageQuotaScope = Readonly<{
  tenantId: string
  projectId: string
}>

export type DocumentStorageQuotaUsage = Readonly<{
  committedBytes: bigint
  activeReservationBytes: bigint
  totalBytes: bigint
}>

type QuotaAggregateRow = {
  committed_bytes: string
  active_reservation_bytes: string
}

type LockedProjectRow = {
  project_id: string
}

const NON_NEGATIVE_INTEGER = /^(0|[1-9][0-9]*)$/

function parseDatabaseByteCount(value: string, field: string): bigint {
  if (!NON_NEGATIVE_INTEGER.test(value)) {
    throw new RangeError(`${field} must be a non-negative database integer`)
  }
  return BigInt(value)
}

/** Adds database text aggregates without passing through a JavaScript number. */
export function checkedDocumentStorageByteTotal(
  committedBytesText: string,
  activeReservationBytesText: string,
): DocumentStorageQuotaUsage {
  const committedBytes = parseDatabaseByteCount(
    committedBytesText,
    'committedBytes',
  )
  const activeReservationBytes = parseDatabaseByteCount(
    activeReservationBytesText,
    'activeReservationBytes',
  )

  return {
    committedBytes,
    activeReservationBytes,
    totalBytes: committedBytes + activeReservationBytes,
  }
}

function isQuotaAggregateRow(value: unknown): value is QuotaAggregateRow {
  if (typeof value !== 'object' || value === null) return false
  if (!('committed_bytes' in value) || !('active_reservation_bytes' in value)) {
    return false
  }
  return (
    typeof value.committed_bytes === 'string' &&
    typeof value.active_reservation_bytes === 'string'
  )
}

function isLockedProjectRow(value: unknown): value is LockedProjectRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'project_id' in value &&
    typeof value.project_id === 'string'
  )
}

/**
 * Locks the active project row and reads exact committed plus pending bytes.
 * Callers must keep every quota-affecting write in the same transaction.
 */
export async function lockProjectDocumentStorageUsage(
  transaction: DocumentStorageQuotaTransaction,
  scope: DocumentStorageQuotaScope,
): Promise<DocumentStorageQuotaUsage | null> {
  const { tenantId, projectId } = scope
  const lockedProjects = await transaction.execute(sql`
    select project.id::text as project_id
    from ${projects} as project
    where project.tenant_id = ${tenantId}
      and project.id = ${projectId}
      and project.deleted_at is null
    for update
  `)

  if (lockedProjects.length === 0) return null
  const lockedProject = lockedProjects[0]
  if (
    lockedProjects.length !== 1 ||
    !isLockedProjectRow(lockedProject) ||
    lockedProject.project_id !== projectId
  ) {
    throw new TypeError('Database returned an invalid locked project')
  }

  const aggregates = await transaction.execute(sql`
    select
      (
        select coalesce(sum(document.size_bytes::numeric), 0)::text
        from ${documents} as document
        where document.tenant_id = ${tenantId}
          and document.project_id = ${projectId}
      ) as committed_bytes,
      (
        select coalesce(sum(reservation.declared_size_bytes::numeric), 0)::text
        from ${documentUploadReservations} as reservation
        where reservation.tenant_id = ${tenantId}
          and reservation.project_id = ${projectId}
          and reservation.state = 'active'
          and reservation.expires_at > now()
      ) as active_reservation_bytes
  `)
  const aggregate = aggregates[0]
  if (aggregates.length !== 1 || !isQuotaAggregateRow(aggregate)) {
    throw new TypeError('Database returned invalid document storage aggregates')
  }

  return checkedDocumentStorageByteTotal(
    aggregate.committed_bytes,
    aggregate.active_reservation_bytes,
  )
}
