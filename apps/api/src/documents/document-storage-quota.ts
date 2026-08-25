import { NotFoundException, PayloadTooLargeException } from '@nestjs/common'
import {
  lockProjectDocumentStorageUsage,
  type DocumentStorageQuotaUsage,
} from '@third-code-erp/database'
import { PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES } from '@third-code-erp/shared-types'

import type { DatabaseTransaction } from '../database/database.service'

type ProjectDocumentStorageScope = Readonly<{
  tenantId: string
  projectId: string
}>

async function lockUsage(
  transaction: DatabaseTransaction,
  scope: ProjectDocumentStorageScope
): Promise<DocumentStorageQuotaUsage> {
  const usage = await lockProjectDocumentStorageUsage(transaction, scope)
  if (!usage) throw new NotFoundException('Project not found')
  return usage
}

/** Serializes a project-scoped document create and enforces exact byte quota. */
export async function lockProjectDocumentStorageForCreate(
  transaction: DatabaseTransaction,
  scope: ProjectDocumentStorageScope,
  additionalBytes: number
): Promise<DocumentStorageQuotaUsage> {
  if (!Number.isSafeInteger(additionalBytes) || additionalBytes <= 0) {
    throw new TypeError('Document size must be a positive safe integer')
  }
  const usage = await lockUsage(transaction, scope)
  if (
    usage.totalBytes + BigInt(additionalBytes) >
    BigInt(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES)
  ) {
    throw new PayloadTooLargeException('Project storage quota exceeded')
  }
  return usage
}

/** Serializes a project-scoped deletion without blocking quota-reducing work. */
export async function lockProjectDocumentStorageForDelete(
  transaction: DatabaseTransaction,
  scope: ProjectDocumentStorageScope
): Promise<DocumentStorageQuotaUsage> {
  return lockUsage(transaction, scope)
}
