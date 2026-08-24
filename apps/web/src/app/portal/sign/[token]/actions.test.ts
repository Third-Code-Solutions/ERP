import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  transaction: vi.fn(),
  txSelect: vi.fn(),
  txFrom: vi.fn(),
  txWhere: vi.fn(),
  txLimit: vi.fn(),
  txFor: vi.fn(),
  txInsert: vi.fn(),
  txInsertValues: vi.fn(),
  txInsertReturning: vi.fn(),
  txUpdate: vi.fn(),
  txSet: vi.fn(),
  txUpdateWhere: vi.fn(),
  txUpdateReturning: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  publicSigningWritesUseCoreApi: vi.fn(),
  signPublicSignatureThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}))

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

vi.mock('@/lib/erp-core-client', () => ({
  publicSigningWritesUseCoreApi: mocks.publicSigningWritesUseCoreApi,
  signPublicSignatureThroughCoreApi: mocks.signPublicSignatureThroughCoreApi,
}))

import { recordCanvasSign } from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const SESSION_ID = '22222222-2222-4222-8222-222222222222'
const ENTITY_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const DOCUMENT_ID = '55555555-5555-4555-8555-555555555555'
const TOKEN = 'a'.repeat(64)

const session = {
  id: SESSION_ID,
  tenant_id: TENANT_ID,
  entity_type: 'variation_order' as const,
  entity_id: ENTITY_ID,
  token_hash: 'hashed-token',
  expires_at: new Date('2099-01-01T00:00:00.000Z'),
  signer_name: null,
  signer_email: null,
  signer_ip: null,
  signer_user_agent: null,
  signed_at: null,
  signature_document_id: null,
  revoked_at: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
}

function validPngDataUrl(): string {
  const bytes = Buffer.alloc(300)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes)
  return `data:image/png;base64,${bytes.toString('base64')}`
}

function signInput(signatureDataUrl = validPngDataUrl()) {
  return {
    token: TOKEN,
    signerName: '  Ana Reyes  ',
    signerEmail: '  ana@example.com  ',
    signatureDataUrl,
  }
}

function collectColumnNames(
  value: unknown,
  seen = new WeakSet<object>()
): string[] {
  if (!value || typeof value !== 'object') return []
  if (seen.has(value)) return []
  seen.add(value)

  const record = value as Record<string, unknown>
  const ownName =
    typeof record.name === 'string' && record.table ? [record.name] : []
  return ownName.concat(
    Object.values(record).flatMap((child) =>
      collectColumnNames(child, seen)
    )
  )
}

describe('public canvas signing integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.publicSigningWritesUseCoreApi.mockReturnValue(false)

    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.where.mockReturnValue({ limit: mocks.limit })
    mocks.limit
      .mockResolvedValueOnce([session])
      .mockResolvedValueOnce([{ project_id: PROJECT_ID }])

    mocks.txSelect.mockReturnValue({ from: mocks.txFrom })
    mocks.txFrom.mockReturnValue({ where: mocks.txWhere })
    mocks.txWhere.mockReturnValue({ limit: mocks.txLimit })
    mocks.txLimit.mockReturnValue({ for: mocks.txFor })
    mocks.txFor.mockResolvedValue([session])

    mocks.txInsert.mockReturnValue({ values: mocks.txInsertValues })
    mocks.txInsertValues.mockReturnValue({
      returning: mocks.txInsertReturning,
    })
    mocks.txInsertReturning.mockResolvedValue([{ id: DOCUMENT_ID }])

    mocks.txUpdate.mockReturnValue({ set: mocks.txSet })
    mocks.txSet.mockReturnValue({ where: mocks.txUpdateWhere })
    mocks.txUpdateWhere.mockReturnValue({
      returning: mocks.txUpdateReturning,
    })
    mocks.txUpdateReturning
      .mockResolvedValueOnce([{ id: ENTITY_ID }])
      .mockResolvedValueOnce([{ id: SESSION_ID }])

    const tx = {
      select: mocks.txSelect,
      insert: mocks.txInsert,
      update: mocks.txUpdate,
    }
    mocks.transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx)
    )

    mocks.upload.mockResolvedValue({ error: null })
    mocks.remove.mockResolvedValue({ error: null })
    mocks.storageFrom.mockReturnValue({
      upload: mocks.upload,
      remove: mocks.remove,
    })
    mocks.createSupabaseAdminClient.mockReturnValue({
      storage: { from: mocks.storageFrom },
    })
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
  })

  it('rejects malformed and oversized PNG payloads before external work', async () => {
    const invalidBytes = Buffer.alloc(300).toString('base64')

    await expect(
      recordCanvasSign(
        signInput(`data:image/png;base64,${invalidBytes}`)
      )
    ).resolves.toEqual({
      ok: false,
      error: 'Signature image is invalid.',
    })
    await expect(
      recordCanvasSign(
        signInput(`data:image/png;base64,${'A'.repeat(700_000)}`)
      )
    ).resolves.toEqual({
      ok: false,
      error: 'Signature image is too large.',
    })

    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('commits document, tenant-scoped source/session stamps, and public audit atomically', async () => {
    const result = await recordCanvasSign(signInput())

    expect(result).toEqual({ ok: true })
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.txFor).toHaveBeenCalledWith('update')
    expect(mocks.txInsert).toHaveBeenCalledOnce()
    expect(mocks.txUpdate).toHaveBeenCalledTimes(2)
    expect(mocks.txUpdateWhere).toHaveBeenCalledTimes(2)

    for (const [condition] of mocks.txUpdateWhere.mock.calls) {
      expect(collectColumnNames(condition)).toContain('tenant_id')
    }

    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        select: mocks.txSelect,
        insert: mocks.txInsert,
        update: mocks.txUpdate,
      }),
      {
        tenantId: TENANT_ID,
        actorId: null,
        entityType: 'variation_order',
        entityId: ENTITY_ID,
        action: 'approve',
        diff: {
          signed_by: 'Ana Reyes',
          signer_email: 'ana@example.com',
          signature_document_id: DOCUMENT_ID,
          mechanism: 'canvas_sign',
        },
      }
    )
    expect(
      mocks.txUpdate.mock.invocationCallOrder.at(-1)
    ).toBeLessThan(
      mocks.writeAuditLogInTransaction.mock.invocationCallOrder[0]!
    )
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('rolls back the official result and removes Storage when audit fails', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.writeAuditLogInTransaction.mockRejectedValue(
      new Error('audit unavailable')
    )

    const result = await recordCanvasSign(signInput())

    expect(result).toEqual({
      ok: false,
      error: 'Could not record signature. Try again.',
    })
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.remove).toHaveBeenCalledOnce()
    expect(errorSpy).toHaveBeenCalledWith(
      '[canvas-sign] signature transaction failed'
    )
    errorSpy.mockRestore()
  })

  it('fails a concurrent replay after row lock without creating a second record', async () => {
    mocks.txFor.mockResolvedValue([
      {
        ...session,
        signed_at: new Date('2026-07-29T00:00:00.000Z'),
        signature_document_id: DOCUMENT_ID,
      },
    ])

    const result = await recordCanvasSign(signInput())

    expect(result).toEqual({ ok: false, error: 'Already signed.' })
    expect(mocks.txInsert).not.toHaveBeenCalled()
    expect(mocks.txUpdate).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
    expect(mocks.remove).toHaveBeenCalledOnce()
  })

  it('rejects a missing or cross-tenant source before upload', async () => {
    mocks.limit.mockReset()
    mocks.limit
      .mockResolvedValueOnce([session])
      .mockResolvedValueOnce([])

    const result = await recordCanvasSign(signInput())

    expect(result).toEqual({
      ok: false,
      error: 'Source entity not found.',
    })
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects a minted signer email mismatch before Core or Storage mutation', async () => {
    mocks.limit.mockReset()
    mocks.limit.mockResolvedValueOnce([
      { ...session, signer_email: 'expected@example.com' },
    ])

    await expect(recordCanvasSign(signInput())).resolves.toEqual({
      ok: false,
      error: 'Signer email does not match this signing invitation.',
    })
    expect(mocks.signPublicSignatureThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('routes an approved tenant through Core without a legacy Storage write', async () => {
    mocks.publicSigningWritesUseCoreApi.mockReturnValue(true)
    mocks.signPublicSignatureThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        sessionId: SESSION_ID,
        tenantId: TENANT_ID,
        entityType: 'variation_order',
        entityId: ENTITY_ID,
        signatureDocumentId: DOCUMENT_ID,
        signedAt: '2026-08-03T00:00:00.000Z',
      },
    })

    await expect(recordCanvasSign(signInput())).resolves.toEqual({ ok: true })
    expect(mocks.signPublicSignatureThroughCoreApi).toHaveBeenCalledWith(
      TOKEN,
      expect.objectContaining({ signerName: 'Ana Reyes' }),
      expect.stringMatching(/^public-sign-[0-9a-f]{64}$/)
    )
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('treats a selected Core failure as terminal and never falls back', async () => {
    mocks.publicSigningWritesUseCoreApi.mockReturnValue(true)
    mocks.signPublicSignatureThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'Core signing unavailable.',
    })

    await expect(recordCanvasSign(signInput())).resolves.toEqual({
      ok: false,
      error: 'Core signing unavailable.',
    })
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
