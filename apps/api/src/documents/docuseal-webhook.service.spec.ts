import 'reflect-metadata'

import {
  bomPortalTokens,
  boms,
  documents,
  notifications,
} from '@third-code-erp/database/schema'
import { describe, expect, it, vi } from 'vitest'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import {
  docuSealArtifactObjectKey,
  type DocuSealArtifactStorage,
} from './docuseal-artifact.storage'
import type { DocuSealProviderService } from './docuseal-provider.service'
import { DocuSealWebhookService } from './docuseal-webhook.service'
import { lockProjectDocumentStorageForCreate } from './document-storage-quota'

vi.mock('./document-storage-quota', () => ({
  lockProjectDocumentStorageForCreate: vi.fn(),
}))

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const BOM_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const TOKEN_ID = '55555555-5555-4555-8555-555555555555'
const SUBMISSION_ID = 'submission-123'
const PDF_BYTES = Buffer.from('%PDF-1.7\nsigned', 'ascii')

const COMMAND = {
  event: 'submission.completed' as const,
  submissionId: SUBMISSION_ID,
  documents: [
    { url: 'https://temporary-provider.example.test/signed.pdf' },
  ],
}

function query(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  chain.from = vi.fn().mockReturnValue(chain)
  chain.innerJoin = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.for = vi.fn().mockResolvedValue(rows)
  chain.then = vi.fn((resolve, reject) =>
    Promise.resolve(rows).then(resolve, reject)
  )
  return chain
}

function harness({
  tokenRows = [
    {
      id: TOKEN_ID,
      tenantId: TENANT_ID,
      bomId: BOM_ID,
      usedAt: null,
    },
  ],
  preflightUsedAt = null,
  transactionUsedAt = preflightUsedAt,
  transactionFailure,
}: {
  tokenRows?: Array<{
    id: string
    tenantId: string
    bomId: string
    usedAt: Date | null
  }>
  preflightUsedAt?: Date | null
  transactionUsedAt?: Date | null
  transactionFailure?: Error
} = {}) {
  vi.mocked(lockProjectDocumentStorageForCreate).mockClear()
  vi.mocked(lockProjectDocumentStorageForCreate).mockResolvedValue({
    committedBytes: 0n,
    activeReservationBytes: 0n,
    totalBytes: 0n,
  })
  const preflightTokenQuery = query(
    tokenRows.map((token) => ({ ...token, usedAt: preflightUsedAt }))
  )
  const bomRow = {
    id: BOM_ID,
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    lockedAt: null,
    tcvCents: 125_000,
    projectName: 'Fit-out',
  }
  const preflightBomQuery = query([bomRow])
  const clientSelect = vi
    .fn()
    .mockReturnValueOnce(preflightTokenQuery)
    .mockReturnValueOnce(preflightBomQuery)

  const tokenQuery = query(
    tokenRows.map((token) => ({ ...token, usedAt: transactionUsedAt }))
  )
  const bomQuery = query([bomRow])
  const recipientQuery = query([
    {
      id: '66666666-6666-4666-8666-666666666666',
      email: 'sales@example.test',
    },
  ])
  const select = vi
    .fn()
    .mockReturnValueOnce(tokenQuery)
    .mockReturnValueOnce(bomQuery)
    .mockReturnValueOnce(recipientQuery)
  const updateWhere = vi.fn().mockResolvedValue([])
  const update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where: updateWhere }),
  })
  const insertValues = vi.fn().mockResolvedValue([])
  const insert = vi.fn().mockReturnValue({ values: insertValues })
  const transactionClient = { select, update, insert }
  const transaction = vi.fn(
    async (callback: (tx: typeof transactionClient) => unknown) => {
      if (transactionFailure) throw transactionFailure
      return callback(transactionClient)
    }
  )
  const database = {
    client: { select: clientSelect, transaction },
  } as unknown as DatabaseService
  const audit = {
    writeSemantic: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  const provider = {
    downloadCompletedPdf: vi.fn().mockResolvedValue({
      name: 'signed.pdf',
      bytes: PDF_BYTES,
    }),
  } as unknown as DocuSealProviderService
  const remove = vi.fn().mockResolvedValue(undefined)
  const artifactStorage = {
    upload: vi.fn().mockResolvedValue(undefined),
    remove,
  } as unknown as DocuSealArtifactStorage

  return {
    service: new DocuSealWebhookService(
      database,
      audit,
      provider,
      artifactStorage
    ),
    clientSelect,
    transaction,
    update,
    insert,
    insertValues,
    audit,
    provider,
    artifactStorage,
    remove,
  }
}

describe('DocuSeal webhook authority', () => {
  it('rejects an empty completion before any database or provider work', async () => {
    const probe = harness()
    await expect(
      probe.service.handle({ ...COMMAND, documents: [] })
    ).rejects.toThrow('submission.completed requires at least one document')
    expect(probe.clientSelect).not.toHaveBeenCalled()
    expect(probe.provider.downloadCompletedPdf).not.toHaveBeenCalled()
  })

  it('ignores an unmatched submission without external work or mutation', async () => {
    const probe = harness({ tokenRows: [] })
    await expect(probe.service.handle(COMMAND)).resolves.toMatchObject({
      received: true,
      handled: false,
      duplicate: false,
    })
    expect(probe.provider.downloadCompletedPdf).not.toHaveBeenCalled()
    expect(probe.artifactStorage.upload).not.toHaveBeenCalled()
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('persists a validated PDF before atomically consuming and locking the BOM', async () => {
    const probe = harness()
    const objectKey = docuSealArtifactObjectKey({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      submissionId: SUBMISSION_ID,
    })
    await expect(probe.service.handle(COMMAND)).resolves.toMatchObject({
      received: true,
      handled: true,
      duplicate: false,
      tenantId: TENANT_ID,
      bomId: BOM_ID,
      projectId: PROJECT_ID,
      signedDocument: {
        name: 'signed.pdf',
        storagePath: objectKey,
        sizeBytes: PDF_BYTES.length,
      },
    })

    expect(probe.provider.downloadCompletedPdf).toHaveBeenCalledWith(
      SUBMISSION_ID
    )
    expect(probe.artifactStorage.upload).toHaveBeenCalledWith(
      objectKey,
      PDF_BYTES
    )
    expect(probe.artifactStorage.upload).toHaveBeenCalledBefore(
      probe.transaction
    )
    expect(probe.insert).toHaveBeenCalledWith(documents)
    expect(lockProjectDocumentStorageForCreate).toHaveBeenCalledWith(
      expect.anything(),
      { tenantId: TENANT_ID, projectId: PROJECT_ID },
      PDF_BYTES.length
    )
    expect(probe.insert).toHaveBeenCalledWith(notifications)
    expect(probe.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        storage_path: objectKey,
        mime_type: 'application/pdf',
        size_bytes: PDF_BYTES.length,
      })
    )
    expect(probe.update).toHaveBeenCalledWith(bomPortalTokens)
    expect(probe.update).toHaveBeenCalledWith(boms)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        entityType: 'bom',
        entityId: BOM_ID,
        action: 'lock',
      })
    )
  })

  it('does not retrieve, store, or repeat side effects for a known replay', async () => {
    const probe = harness({
      preflightUsedAt: new Date('2026-08-10T00:00:00.000Z'),
    })
    await expect(probe.service.handle(COMMAND)).resolves.toMatchObject({
      received: true,
      handled: true,
      duplicate: true,
    })
    expect(probe.provider.downloadCompletedPdf).not.toHaveBeenCalled()
    expect(probe.artifactStorage.upload).not.toHaveBeenCalled()
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('keeps the deterministic object when a concurrent replay wins the lock', async () => {
    const probe = harness({
      transactionUsedAt: new Date('2026-08-10T00:00:00.000Z'),
    })
    await expect(probe.service.handle(COMMAND)).resolves.toMatchObject({
      handled: true,
      duplicate: true,
    })
    expect(probe.artifactStorage.upload).toHaveBeenCalledOnce()
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.update).not.toHaveBeenCalled()
    expect(probe.remove).not.toHaveBeenCalled()
    expect(lockProjectDocumentStorageForCreate).not.toHaveBeenCalled()
  })

  it('does not mutate token or BOM when provider retrieval fails', async () => {
    const probe = harness()
    vi.mocked(probe.provider.downloadCompletedPdf).mockRejectedValue(
      new Error('provider unavailable')
    )
    await expect(probe.service.handle(COMMAND)).rejects.toThrow(
      'provider unavailable'
    )
    expect(probe.artifactStorage.upload).not.toHaveBeenCalled()
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('does not mutate when durable upload fails', async () => {
    const probe = harness()
    vi.mocked(probe.artifactStorage.upload).mockRejectedValue(
      new Error('storage unavailable')
    )
    await expect(probe.service.handle(COMMAND)).rejects.toThrow(
      'storage unavailable'
    )
    expect(probe.transaction).not.toHaveBeenCalled()
    expect(probe.remove).not.toHaveBeenCalled()
  })

  it('retains the deterministic object when commit ownership is ambiguous', async () => {
    const probe = harness({ transactionFailure: new Error('commit failed') })
    const objectKey = docuSealArtifactObjectKey({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      submissionId: SUBMISSION_ID,
    })
    await expect(probe.service.handle(COMMAND)).rejects.toThrow('commit failed')
    expect(probe.artifactStorage.upload).toHaveBeenCalledWith(
      objectKey,
      PDF_BYTES
    )
    expect(probe.remove).not.toHaveBeenCalled()
  })
})
