import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  createKycArtifactThroughCoreApi: vi.fn(),
  getAccountKycDocumentsThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  transaction: vi.fn(),
  stampActorInTransaction: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  select: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))
vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, transaction: mocks.transaction },
}))
vi.mock('@/lib/audit', () => ({
  stampActorInTransaction: mocks.stampActorInTransaction,
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))
vi.mock('@/lib/erp-core-client', () => ({
  createKycArtifactThroughCoreApi: mocks.createKycArtifactThroughCoreApi,
  getAccountKycDocumentsThroughCoreApi:
    mocks.getAccountKycDocumentsThroughCoreApi,
}))

import {
  addKycArtifact,
  createAccount,
  listAccountKycDocuments,
  reviewKyc,
} from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'

function query<T>(rows: T[]) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    for: vi.fn(),
    then: (onFulfilled?: (value: T[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(onFulfilled, onRejected),
  }
  builder.from.mockReturnValue(builder)
  builder.where.mockReturnValue(builder)
  builder.limit.mockReturnValue(builder)
  builder.for.mockReturnValue(builder)
  return builder
}

function accountTransaction(rows: Array<{ id: string; kyc_status?: string; kyc_notes?: string | null }>) {
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: ACCOUNT_ID }]) }),
  })
  const update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: ACCOUNT_ID }]) }),
    }),
  })
  const tx = { select: vi.fn().mockReturnValue(query(rows)), insert, update }
  mocks.transaction.mockImplementationOnce(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
  return { tx, insert, update }
}

function accountForm(): FormData {
  const form = new FormData()
  form.set('name', 'Northstar MEP Inc.')
  return form
}

function reviewForm(): FormData {
  const form = new FormData()
  form.set('account_id', ACCOUNT_ID)
  form.set('decision', 'approved')
  form.set('notes', 'Verified')
  return form
}

const PROFILE = {
  user: { id: USER_ID },
  tenantId: TENANT_ID,
  role: 'sales',
  email: 'sales@example.test',
}

const DOCUMENT_RESULT = {
  accountId: ACCOUNT_ID,
  tenantId: TENANT_ID,
  rows: [],
  selectedDocument: null,
  page: 2,
  limit: 20,
  total: 21,
  totalPages: 2,
}

const DOCUMENT_ROW = {
  documentId: DOCUMENT_ID,
  tenantId: TENANT_ID,
  accountId: ACCOUNT_ID,
  fileName: 'evidence.pdf',
  documentType: 'pdf',
  mimeType: 'application/pdf',
  createdAt: '2026-09-12T00:00:00.000Z',
  projectId: null,
  projectName: null,
  opportunityId: null,
  opportunityStage: null,
  opportunityType: null,
}

describe('KYC artifact server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(true)
    mocks.createKycArtifactThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        artifactId: REQUEST_ID,
        tenantId: TENANT_ID,
        accountId: ACCOUNT_ID,
        documentId: DOCUMENT_ID,
        changed: true,
      },
    })
    mocks.getAccountKycDocumentsThroughCoreApi.mockResolvedValue({
      ok: true,
      data: DOCUMENT_RESULT,
    })
  })

  it('keeps account creation and audit in one transaction on audit failure', async () => {
    const { tx, insert } = accountTransaction([])
    mocks.writeAuditLogInTransaction.mockRejectedValueOnce(new Error('Audit insert failed'))

    await expect(createAccount(accountForm())).resolves.toEqual({
      error: 'Account creation could not be confirmed. Refresh the account list before retrying.',
    })
    expect(insert).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      tenantId: TENANT_ID,
      actorId: USER_ID,
      entityId: ACCOUNT_ID,
      action: 'create',
    }))
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('keeps KYC review and audit in one transaction and skips an identical retry', async () => {
    const first = accountTransaction([{ id: ACCOUNT_ID, kyc_status: 'pending', kyc_notes: null }])
    mocks.writeAuditLogInTransaction.mockRejectedValueOnce(new Error('Audit insert failed'))

    await expect(reviewKyc(reviewForm())).resolves.toEqual({
      error: 'KYC review could not be confirmed. Refresh the account before retrying.',
    })
    expect(first.update).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(first.tx, expect.objectContaining({
      tenantId: TENANT_ID,
      actorId: USER_ID,
      entityId: ACCOUNT_ID,
      action: 'approve',
    }))
    expect(mocks.revalidatePath).not.toHaveBeenCalled()

    const retry = accountTransaction([{ id: ACCOUNT_ID, kyc_status: 'approved', kyc_notes: 'Verified' }])
    await expect(reviewKyc(reviewForm())).resolves.toEqual({})
    expect(retry.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledTimes(1)
  })

  it('routes a normalized command through Core and verifies returned scope', async () => {
    await expect(
      addKycArtifact(ACCOUNT_ID.toUpperCase(), {
        clientRequestId: REQUEST_ID.toUpperCase(),
        artifactType: 'other',
        documentId: DOCUMENT_ID.toUpperCase(),
        notes: '  Supporting note  ',
      }),
    ).resolves.toEqual({
      success: 'KYC artifact added.',
      changed: true,
    })

    expect(mocks.createKycArtifactThroughCoreApi).toHaveBeenCalledWith(
      ACCOUNT_ID,
      {
        clientRequestId: REQUEST_ID,
        artifactType: 'other',
        documentId: DOCUMENT_ID,
        notes: 'Supporting note',
      },
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/crm/accounts/${ACCOUNT_ID}`,
    )
  })

  it('keeps Core transport failures retryable for the client', async () => {
    mocks.createKycArtifactThroughCoreApi.mockResolvedValueOnce({
      ok: false,
      status: 503,
      error:
        'ERP Core API is unavailable. KYC artifact outcome is unconfirmed; retry with the same request.',
    })

    await expect(
      addKycArtifact(ACCOUNT_ID, {
        clientRequestId: REQUEST_ID,
        artifactType: 'other',
        documentId: null,
        notes: null,
      }),
    ).resolves.toEqual({
      error:
        'ERP Core API is unavailable. KYC artifact outcome is unconfirmed; retry with the same request.',
      outcome: 'unknown',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('returns confirmed Core rejections separately from unknown outcomes', async () => {
    mocks.createKycArtifactThroughCoreApi.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: 'You do not have permission to add KYC artifacts.',
    })

    await expect(
      addKycArtifact(ACCOUNT_ID, {
        clientRequestId: REQUEST_ID,
        artifactType: 'other',
        documentId: null,
        notes: null,
      }),
    ).resolves.toEqual({
      error: 'You do not have permission to add KYC artifacts.',
      outcome: 'rejected',
    })
  })

  it('fails closed when Core returns a different artifact identity or scope', async () => {
    mocks.createKycArtifactThroughCoreApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        artifactId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        accountId: ACCOUNT_ID,
        documentId: DOCUMENT_ID,
        changed: true,
      },
    })

    await expect(
      addKycArtifact(ACCOUNT_ID, {
        clientRequestId: REQUEST_ID,
        artifactType: 'other',
        documentId: DOCUMENT_ID,
        notes: null,
      }),
    ).resolves.toEqual({
      error: 'ERP Core API returned an invalid KYC artifact result.',
      outcome: 'unknown',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('lists only the current account through the paginated Core reader', async () => {
    const selectedResult = { ...DOCUMENT_RESULT, selectedDocument: DOCUMENT_ROW }
    mocks.getAccountKycDocumentsThroughCoreApi.mockResolvedValueOnce({
      ok: true,
      data: selectedResult,
    })

    await expect(
      listAccountKycDocuments(ACCOUNT_ID.toUpperCase(), {
        q: '  site photo  ',
        page: 2,
        limit: 20,
        selectedDocumentId: DOCUMENT_ID.toUpperCase(),
      }),
    ).resolves.toEqual({ ok: true, data: selectedResult })

    expect(mocks.getAccountKycDocumentsThroughCoreApi).toHaveBeenCalledWith(
      ACCOUNT_ID,
      {
        q: 'site photo',
        page: 2,
        limit: 20,
        selectedDocumentId: DOCUMENT_ID,
      },
    )
  })

  it('fails closed instead of exposing a wrong-tenant or wrong-account row', async () => {
    mocks.getAccountKycDocumentsThroughCoreApi.mockResolvedValueOnce({
      ok: true,
      data: {
        ...DOCUMENT_RESULT,
        rows: [
          {
            ...DOCUMENT_ROW,
            tenantId: '66666666-6666-4666-8666-666666666666',
            accountId: '77777777-7777-4777-8777-777777777777',
          },
        ],
      },
    })

    await expect(
      listAccountKycDocuments(ACCOUNT_ID, { page: 2, limit: 20 }),
    ).resolves.toEqual({
      ok: false,
      error: 'ERP Core API returned an invalid account document scope.',
    })
  })

  it('fails closed when Core resolves a selected document to a different identity', async () => {
    mocks.getAccountKycDocumentsThroughCoreApi.mockResolvedValueOnce({
      ok: true,
      data: {
        ...DOCUMENT_RESULT,
        selectedDocument: {
          ...DOCUMENT_ROW,
          documentId: '88888888-8888-4888-8888-888888888888',
        },
      },
    })

    await expect(
      listAccountKycDocuments(ACCOUNT_ID, {
        page: 2,
        limit: 20,
        selectedDocumentId: DOCUMENT_ID,
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'ERP Core API returned an invalid account document scope.',
    })
  })

  it('allows Core to resolve a requested selection to null without exposing rows', async () => {
    const resultWithUnavailableSelection = {
      ...DOCUMENT_RESULT,
      selectedDocument: null,
    }
    mocks.getAccountKycDocumentsThroughCoreApi.mockResolvedValueOnce({
      ok: true,
      data: resultWithUnavailableSelection,
    })

    await expect(
      listAccountKycDocuments(ACCOUNT_ID, {
        page: 2,
        limit: 20,
        selectedDocumentId: DOCUMENT_ID,
      }),
    ).resolves.toEqual({ ok: true, data: resultWithUnavailableSelection })
  })

  it('does not call Core when the actor lacks account.create', async () => {
    mocks.can.mockReturnValue(false)

    await expect(
      listAccountKycDocuments(ACCOUNT_ID, { page: 1, limit: 20 }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('account.create'),
    })
    expect(mocks.getAccountKycDocumentsThroughCoreApi).not.toHaveBeenCalled()
  })
})
