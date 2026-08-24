import 'reflect-metadata'

import {
  lockProjectDocumentStorageUsage,
  type DocumentStorageQuotaUsage,
} from '@third-code-erp/database'
import { PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES } from '@third-code-erp/shared-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DatabaseTransaction } from '../database/database.service'
import {
  lockProjectDocumentStorageForCreate,
  lockProjectDocumentStorageForDelete,
} from './document-storage-quota'

vi.mock('@third-code-erp/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@third-code-erp/database')>()
  return { ...actual, lockProjectDocumentStorageUsage: vi.fn() }
})

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TRANSACTION = {} as DatabaseTransaction
const EMPTY_USAGE: DocumentStorageQuotaUsage = {
  committedBytes: 0n,
  activeReservationBytes: 0n,
  totalBytes: 0n,
}

describe('project document storage quota mutation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(lockProjectDocumentStorageUsage).mockResolvedValue(EMPTY_USAGE)
  })

  it('locks the exact tenant/project and accepts the byte-exact quota boundary', async () => {
    vi.mocked(lockProjectDocumentStorageUsage).mockResolvedValue({
      committedBytes: BigInt(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES - 2),
      activeReservationBytes: 1n,
      totalBytes: BigInt(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES - 1),
    })

    await expect(
      lockProjectDocumentStorageForCreate(
        TRANSACTION,
        { tenantId: TENANT_ID, projectId: PROJECT_ID },
        1
      )
    ).resolves.toMatchObject({
      totalBytes: BigInt(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES - 1),
    })
    expect(lockProjectDocumentStorageUsage).toHaveBeenCalledWith(TRANSACTION, {
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
    })
  })

  it('rejects one byte over quota after acquiring the shared project lock', async () => {
    vi.mocked(lockProjectDocumentStorageUsage).mockResolvedValue({
      committedBytes: BigInt(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES),
      activeReservationBytes: 0n,
      totalBytes: BigInt(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES),
    })

    await expect(
      lockProjectDocumentStorageForCreate(
        TRANSACTION,
        { tenantId: TENANT_ID, projectId: PROJECT_ID },
        1
      )
    ).rejects.toThrow('Project storage quota exceeded')
    expect(lockProjectDocumentStorageUsage).toHaveBeenCalledOnce()
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid additional byte count %s before database access',
    async (additionalBytes) => {
      await expect(
        lockProjectDocumentStorageForCreate(
          TRANSACTION,
          { tenantId: TENANT_ID, projectId: PROJECT_ID },
          additionalBytes
        )
      ).rejects.toThrow('Document size must be a positive safe integer')
      expect(lockProjectDocumentStorageUsage).not.toHaveBeenCalled()
    }
  )

  it('fails closed when the locked tenant/project does not exist', async () => {
    vi.mocked(lockProjectDocumentStorageUsage).mockResolvedValue(null)

    await expect(
      lockProjectDocumentStorageForCreate(
        TRANSACTION,
        { tenantId: TENANT_ID, projectId: PROJECT_ID },
        1
      )
    ).rejects.toThrow('Project not found')
  })

  it('locks deletions without enforcing the upper quota bound', async () => {
    const overQuota = {
      committedBytes: BigInt(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES + 1),
      activeReservationBytes: 0n,
      totalBytes: BigInt(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES + 1),
    }
    vi.mocked(lockProjectDocumentStorageUsage).mockResolvedValue(overQuota)

    await expect(
      lockProjectDocumentStorageForDelete(TRANSACTION, {
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
      })
    ).resolves.toEqual(overQuota)
  })
})
