import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  remove: vi.fn(),
  writeAuditLog: vi.fn(),
  storageUploadsEnabled: vi.fn(),
  storageUploadsViaCore: vi.fn(),
  signStorageThroughCore: vi.fn(),
  cleanupStorageThroughCore: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUser: mocks.getUser,
  can: mocks.can,
}))
vi.mock('@third-code-erp/auth/server', () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))
vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/erp-core-client', () => ({
  financeReconciliationStorageUploadsUseCoreApi: mocks.storageUploadsEnabled,
  financeReconciliationStorageUploadsViaCoreApi: mocks.storageUploadsViaCore,
  signBankStatementStorageThroughCoreApi: mocks.signStorageThroughCore,
  cleanupBankStatementStorageThroughCoreApi: mocks.cleanupStorageThroughCore,
}))

import { DELETE, POST } from './route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('bank statement signed upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ id: USER_ID })
    mocks.can.mockReturnValue(true)
    mocks.storageUploadsEnabled.mockReturnValue(true)
    mocks.storageUploadsViaCore.mockReturnValue(false)
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.where.mockResolvedValue([{ tenant_id: TENANT_ID, role: 'finance' }])
    mocks.storageFrom.mockReturnValue({
      createSignedUploadUrl: mocks.createSignedUploadUrl,
      remove: mocks.remove,
    })
    mocks.createSupabaseAdminClient.mockReturnValue({
      storage: { from: mocks.storageFrom },
    })
    mocks.createSignedUploadUrl.mockImplementation(async (path: string) => ({
      data: {
        signedUrl: 'https://storage.example.test/upload',
        token: 'signed-token',
        path,
      },
      error: null,
    }))
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.remove.mockResolvedValue({ data: [], error: null })
  })

  it('rejects a non-finance role before Storage work', async () => {
    mocks.can.mockReturnValue(false)
    const response = await POST(
      new NextRequest('http://localhost/api/finance/reconciliation/import/sign', {
        method: 'POST',
        body: JSON.stringify({ fileName: 'statement.csv', sizeBytes: 1_024 }),
      })
    )
    expect(response.status).toBe(403)
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('keeps the signed-upload route closed unless the exact tenant canary is on', async () => {
    mocks.storageUploadsEnabled.mockReturnValue(false)
    const response = await POST(
      new NextRequest('http://localhost/api/finance/reconciliation/import/sign', {
        method: 'POST',
        body: JSON.stringify({ fileName: 'statement.csv', sizeBytes: 1_024 }),
      })
    )
    expect(response.status).toBe(503)
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('returns an audited tenant-scoped signed upload URL', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/finance/reconciliation/import/sign', {
        method: 'POST',
        body: JSON.stringify({ fileName: 'July statement.csv', sizeBytes: 1_024 }),
      })
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      signedUrl: 'https://storage.example.test/upload',
      token: 'signed-token',
      originalFileName: 'July statement.csv',
    })
    expect(body.storagePath).toMatch(
      new RegExp(`^${TENANT_ID}/bank-statements/[0-9a-f-]+-July_statement\.csv$`)
    )
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'bank_statement_upload',
        entityId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        ),
        diff: expect.objectContaining({ storage_path: body.storagePath }),
      })
    )
  })

  it('delegates signing to Core without falling back when the separate Core gate is selected', async () => {
    mocks.storageUploadsEnabled.mockReturnValue(false)
    mocks.storageUploadsViaCore.mockReturnValue(true)
    mocks.signStorageThroughCore.mockResolvedValue({
      ok: true,
      data: {
        signedUrl: 'https://storage.example.test/core-upload',
        token: 'core-token',
        storagePath: `${TENANT_ID}/bank-statements/core.csv`,
        originalFileName: 'core.csv',
      },
    })

    const response = await POST(
      new NextRequest('http://localhost/api/finance/reconciliation/import/sign', {
        method: 'POST',
        body: JSON.stringify({ fileName: 'core.csv', sizeBytes: 90 }),
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ token: 'core-token' })
    expect(mocks.signStorageThroughCore).toHaveBeenCalledOnce()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('rejects oversize or non-CSV sources before Storage work', async () => {
    for (const body of [
      { fileName: 'statement.pdf', sizeBytes: 1_024 },
      { fileName: 'statement.csv', sizeBytes: 2_000_001 },
    ]) {
      const response = await POST(
        new NextRequest('http://localhost/api/finance/reconciliation/import/sign', {
          method: 'POST',
          body: JSON.stringify(body),
        })
      )
      expect(response.status).toBe(400)
    }
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('cleans only an authorized tenant path and audits the deletion', async () => {
    const response = await DELETE(
      new NextRequest('http://localhost/api/finance/reconciliation/import/sign', {
        method: 'DELETE',
        body: JSON.stringify({
          storagePath: `${TENANT_ID}/bank-statements/failed.csv`,
        }),
      })
    )
    expect(response.status).toBe(200)
    expect(mocks.remove).toHaveBeenCalledWith([
      `${TENANT_ID}/bank-statements/failed.csv`,
    ])
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete',
        entityId: TENANT_ID,
        diff: {
          operation: 'signed_upload_source_cleanup_requested',
          storage_path: `${TENANT_ID}/bank-statements/failed.csv`,
        },
      })
    )
    expect(mocks.writeAuditLog.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.remove.mock.invocationCallOrder[0]!
    )
  })

  it('delegates cleanup to Core without falling back when selected', async () => {
    mocks.storageUploadsViaCore.mockReturnValue(true)
    mocks.cleanupStorageThroughCore.mockResolvedValue({
      ok: true,
      data: { ok: true },
    })
    const storagePath = `${TENANT_ID}/bank-statements/core-failed.csv`
    const response = await DELETE(
      new NextRequest('http://localhost/api/finance/reconciliation/import/sign', {
        method: 'DELETE',
        body: JSON.stringify({ storagePath }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.cleanupStorageThroughCore).toHaveBeenCalledWith({ storagePath })
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('rejects cross-tenant cleanup before Storage work', async () => {
    const response = await DELETE(
      new NextRequest('http://localhost/api/finance/reconciliation/import/sign', {
        method: 'DELETE',
        body: JSON.stringify({
          storagePath: `33333333-3333-4333-8333-333333333333/bank-statements/failed.csv`,
        }),
      })
    )
    expect(response.status).toBe(403)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
