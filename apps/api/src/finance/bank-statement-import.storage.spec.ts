import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  BankStatementImportStorageService,
} from './bank-statement-import.storage'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

const createSignedUrl = vi.fn()
const config = {
  get: vi.fn((key: string) =>
    key === 'SUPABASE_SERVICE_ROLE_KEY' ? 's'.repeat(24) : undefined
  ),
  getOrThrow: vi.fn(() => 'https://storage.example.test'),
}

describe('bank statement import storage reader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('date,reference,description,amount\n2026-07-01,R,Deposit,1.00\n', {
          status: 200,
        })
      )
    )
    vi.mocked(createClient).mockReturnValue({
      storage: { from: () => ({ createSignedUrl }) },
    } as never)
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.test/signed' },
      error: null,
    })
  })

  it('reads a private object through a short-lived signed URL', async () => {
    const service = new BankStatementImportStorageService(config as never)
    const bytes = await service.readCsv(
      '22222222-2222-4222-8222-222222222222/bank-statements/source.csv'
    )
    expect(new TextDecoder().decode(bytes)).toContain('Deposit')
    expect(createSignedUrl).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222/bank-statements/source.csv',
      60
    )
  })

  it('fails closed when storage credentials are unavailable', async () => {
    const missingConfig = {
      get: vi.fn(() => undefined),
      getOrThrow: vi.fn(() => 'https://storage.example.test'),
    }
    const service = new BankStatementImportStorageService(missingConfig as never)
    await expect(service.readCsv('x')).rejects.toMatchObject({
      code: 'credentials_unavailable',
    })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('rejects an object larger than the bounded import cap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(null, {
          status: 200,
          headers: { 'content-length': '2000001' },
        })
      )
    )
    const service = new BankStatementImportStorageService(config as never)
    await expect(service.readCsv('x')).rejects.toMatchObject({
      code: 'object_too_large',
    })
  })
})
