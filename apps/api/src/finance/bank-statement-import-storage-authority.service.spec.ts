import 'reflect-metadata'

import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { BankStatementImportStorageAuthorityService } from './bank-statement-import-storage-authority.service'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'finance',
  email: 'finance@example.test',
}

function makeProbe(enabled = false, tenantIds: string[] = [TENANT_ID]) {
  const createSignedUploadUrl = vi.fn()
  const remove = vi.fn()
  const from = vi.fn(() => ({ createSignedUploadUrl, remove }))
  vi.mocked(createClient).mockReturnValue({ storage: { from } } as never)
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_ENABLED') {
        return enabled
      }
      if (key === 'ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_TENANT_IDS') {
        return tenantIds
      }
      if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 's'.repeat(24)
      return undefined
    }),
    getOrThrow: vi.fn(() => 'https://storage.example.test'),
  } as unknown as ConfigService
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({})
  )
  const database = { client: { transaction } } as unknown as DatabaseService
  const auditMock = {
    stampActor: vi.fn(),
    writeSemantic: vi.fn(),
  }
  const audit = auditMock as unknown as AuditService
  return {
    service: new BankStatementImportStorageAuthorityService(
      config,
      database,
      audit
    ),
    createSignedUploadUrl,
    remove,
    transaction,
    audit: auditMock,
  }
}

describe('bank statement Storage authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fails closed before credentials, database, or Storage work', async () => {
    const probe = makeProbe()
    await expect(
      probe.service.createSignedUpload(
        { fileName: 'statement.csv', mimeType: 'text/csv', sizeBytes: 10 },
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('signs a tenant-prefixed CSV and audits authorization', async () => {
    const probe = makeProbe(true)
    probe.createSignedUploadUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://storage.example.test/upload',
        token: 'signed-token',
      },
      error: null,
    })

    const result = await probe.service.createSignedUpload(
      { fileName: 'July statement.csv', mimeType: 'text/csv', sizeBytes: 90 },
      PRINCIPAL
    )

    expect(result).toMatchObject({
      signedUrl: 'https://storage.example.test/upload',
      token: 'signed-token',
      originalFileName: 'July statement.csv',
    })
    expect(result.storagePath).toMatch(
      new RegExp(`^${TENANT_ID}/bank-statements/[0-9a-f-]+-July_statement\\.csv$`)
    )
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        action: 'query',
        diff: expect.objectContaining({ storage_path: result.storagePath }),
      })
    )
  })

  it('rejects cross-tenant cleanup before Storage work', async () => {
    const probe = makeProbe(true)
    await expect(
      probe.service.cleanup(
        {
          storagePath:
            '33333333-3333-4333-8333-333333333333/bank-statements/source.csv',
        },
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(probe.remove).not.toHaveBeenCalled()
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('audits and removes only an authorized tenant path', async () => {
    const probe = makeProbe(true)
    probe.remove.mockResolvedValue({ data: [], error: null })
    const storagePath = `${TENANT_ID}/bank-statements/failed.csv`

    await expect(
      probe.service.cleanup({ storagePath }, PRINCIPAL)
    ).resolves.toEqual({ ok: true })
    expect(probe.remove).toHaveBeenCalledWith([storagePath])
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'delete' })
    )
    expect(probe.audit.writeSemantic.mock.invocationCallOrder[0]!).toBeLessThan(
      probe.remove.mock.invocationCallOrder[0]!
    )
  })
})
