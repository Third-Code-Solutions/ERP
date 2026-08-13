import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  transaction: vi.fn(),
  txSelect: vi.fn(),
  txFrom: vi.fn(),
  txWhere: vi.fn(),
  txLimit: vi.fn(),
  txFor: vi.fn(),
  txDelete: vi.fn(),
  txDeleteWhere: vi.fn(),
  txReturning: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  storageFrom: vi.fn(),
  remove: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/auth/server', () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

import { deleteDocument } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'

function requestForm(overrides?: {
  documentId?: string
  projectId?: string
}) {
  const formData = new FormData()
  formData.set('document_id', overrides?.documentId ?? DOCUMENT_ID)
  formData.set('project_id', overrides?.projectId ?? PROJECT_ID)
  return formData
}

describe('deleteDocument authority and integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'pm',
      email: 'pm@example.com',
      fullName: 'PM User',
    })
    mocks.can.mockReturnValue(true)
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.where.mockResolvedValue([{ tenant_id: TENANT_ID, role: 'pm' }])

    mocks.txSelect.mockReturnValue({ from: mocks.txFrom })
    mocks.txFrom.mockReturnValue({ where: mocks.txWhere })
    mocks.txWhere.mockReturnValue({ limit: mocks.txLimit })
    mocks.txLimit.mockReturnValue({ for: mocks.txFor })
    mocks.txFor.mockResolvedValue([
      {
        id: DOCUMENT_ID,
        storage_path: `${TENANT_ID}/${PROJECT_ID}/drawing.dwg`,
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
      },
    ])

    mocks.txDelete.mockReturnValue({ where: mocks.txDeleteWhere })
    mocks.txDeleteWhere.mockReturnValue({ returning: mocks.txReturning })
    mocks.txReturning
      .mockResolvedValueOnce([{ id: '55555555-5555-4555-8555-555555555555' }])
      .mockResolvedValueOnce([{ id: DOCUMENT_ID }])

    const tx = {
      select: mocks.txSelect,
      delete: mocks.txDelete,
    }
    mocks.transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => unknown) =>
        callback(tx)
    )
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
    mocks.storageFrom.mockReturnValue({ remove: mocks.remove })
    mocks.remove.mockResolvedValue({ error: null })
    mocks.createSupabaseAdminClient.mockReturnValue({
      storage: { from: mocks.storageFrom },
    })
  })

  it('rejects invalid identifiers before authentication or database work', async () => {
    const result = await deleteDocument(
      requestForm({ documentId: 'not-a-uuid' })
    )

    expect(result).toEqual({
      ok: false,
      error: 'Invalid document request',
    })
    expect(mocks.getUserProfile).not.toHaveBeenCalled()
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('rejects a role without document mutation capability', async () => {
    mocks.can.mockReturnValue(false)

    const result = await deleteDocument(requestForm())

    expect(result).toEqual({ ok: false, error: 'Forbidden' })
    expect(mocks.can).toHaveBeenCalledWith('pm', 'document.manage')
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('does not reveal or mutate a missing, cross-tenant, or mismatched-Project document', async () => {
    mocks.txFor.mockResolvedValue([])

    const result = await deleteDocument(requestForm())

    expect(result).toEqual({ ok: false, error: 'Document not found' })
    expect(mocks.txDelete).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('commits derived-row deletion, document deletion, and audit before Storage cleanup', async () => {
    const result = await deleteDocument(requestForm())

    expect(result).toEqual({ ok: true })
    expect(mocks.txDelete).toHaveBeenCalledTimes(2)
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        select: mocks.txSelect,
        delete: mocks.txDelete,
      }),
      {
        tenantId: TENANT_ID,
        actorId: USER_ID,
        entityType: 'document',
        entityId: DOCUMENT_ID,
        action: 'delete',
        diff: {
          project_id: PROJECT_ID,
          derived_scope_items_removed: 1,
          storage_cleanup: 'best_effort_after_commit',
        },
      }
    )
    expect(mocks.remove).toHaveBeenCalledWith([
      `${TENANT_ID}/${PROJECT_ID}/drawing.dwg`,
    ])
    expect(mocks.writeAuditLogInTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.remove.mock.invocationCallOrder[0]!
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/documents`
    )
  })

  it('keeps Storage intact when the official database transaction fails', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.writeAuditLogInTransaction.mockRejectedValue(
      new Error('audit unavailable')
    )

    const result = await deleteDocument(requestForm())

    expect(result).toEqual({ ok: false, error: 'Delete failed' })
    expect(errorSpy).toHaveBeenCalledOnce()
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
