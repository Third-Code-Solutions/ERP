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
  writeAuditLog: vi.fn(),
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

import { POST } from './route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('bank statement signed upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ id: USER_ID })
    mocks.can.mockReturnValue(true)
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.where.mockResolvedValue([{ tenant_id: TENANT_ID, role: 'finance' }])
    mocks.storageFrom.mockReturnValue({
      createSignedUploadUrl: mocks.createSignedUploadUrl,
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
})
