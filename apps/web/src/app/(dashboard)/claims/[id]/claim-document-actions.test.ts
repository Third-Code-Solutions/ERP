import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  attachClaimDocumentThroughCoreApi: vi.fn(),
  getProjectDocumentsThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))
vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/operations/notifications', () => ({ notifyRoles: vi.fn() }))
vi.mock('@/lib/erp-core-client', () => ({
  attachClaimDocumentThroughCoreApi: mocks.attachClaimDocumentThroughCoreApi,
  getProjectDocumentsThroughCoreApi: mocks.getProjectDocumentsThroughCoreApi,
}))

import {
  attachClaimDocument,
  listClaimDocuments,
} from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const CLAIM_ID = '44444444-4444-4444-8444-444444444444'
const DOCUMENT_ID = '55555555-5555-4555-8555-555555555555'
const REQUEST_ID = '66666666-6666-4666-8666-666666666666'

const PROFILE = {
  user: { id: USER_ID },
  tenantId: TENANT_ID,
  role: 'pm',
  email: 'pm@example.test',
  fullName: 'PM',
}

const CLAIM = { id: CLAIM_ID, project_id: PROJECT_ID }

const DOCUMENT_RESULT = {
  projectId: PROJECT_ID,
  rows: [],
  total: 101,
  page: 3,
  limit: 25,
  totalPages: 5,
}

describe('claim document server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(true)
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.where.mockReturnValue({ limit: mocks.limit })
    mocks.limit.mockResolvedValue([CLAIM])
    mocks.attachClaimDocumentThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        attachmentId: REQUEST_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        claimId: CLAIM_ID,
        documentId: DOCUMENT_ID,
        changed: true,
      },
    })
    mocks.getProjectDocumentsThroughCoreApi.mockResolvedValue({
      ok: true,
      data: DOCUMENT_RESULT,
    })
  })

  it('routes the normalized command through Core and retains the request identity', async () => {
    await expect(
      attachClaimDocument(CLAIM_ID.toUpperCase(), {
        clientRequestId: REQUEST_ID.toUpperCase(),
        documentId: DOCUMENT_ID.toUpperCase(),
        kind: 'photo',
        caption: '  Site photo  ',
      }),
    ).resolves.toEqual({
      success: 'Document attached.',
      changed: true,
    })

    expect(mocks.attachClaimDocumentThroughCoreApi).toHaveBeenCalledWith(
      CLAIM_ID,
      {
        clientRequestId: REQUEST_ID,
        documentId: DOCUMENT_ID,
        kind: 'photo',
        caption: 'Site photo',
      },
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/claims/${CLAIM_ID}`)
  })

  it('keeps Core uncertainty visible so the caller can retry the same payload', async () => {
    mocks.attachClaimDocumentThroughCoreApi.mockResolvedValueOnce({
      ok: false,
      status: 503,
      error: 'ERP Core API is unavailable. Attachment outcome is unconfirmed; retry with the same request.',
    })

    await expect(
      attachClaimDocument(CLAIM_ID, {
        clientRequestId: REQUEST_ID,
        documentId: DOCUMENT_ID,
        kind: 'photo',
        caption: null,
      }),
    ).resolves.toEqual({
      error: 'ERP Core API is unavailable. Attachment outcome is unconfirmed; retry with the same request.',
      outcome: 'unknown',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('rotates only after a confirmed rejection', async () => {
    mocks.attachClaimDocumentThroughCoreApi.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: 'Attachment request conflicts with an existing command or claim state.',
    })

    await expect(
      attachClaimDocument(CLAIM_ID, {
        clientRequestId: REQUEST_ID,
        documentId: DOCUMENT_ID,
        kind: 'photo',
        caption: null,
      }),
    ).resolves.toEqual({
      error: 'Attachment request conflicts with an existing command or claim state.',
      outcome: 'rejected',
    })
  })

  it('fails closed when Core returns an attachment for a different request identity', async () => {
    mocks.attachClaimDocumentThroughCoreApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        attachmentId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        claimId: CLAIM_ID,
        documentId: DOCUMENT_ID,
        changed: true,
      },
    })

    await expect(
      attachClaimDocument(CLAIM_ID, {
        clientRequestId: REQUEST_ID,
        documentId: DOCUMENT_ID,
        kind: 'photo',
        caption: null,
      }),
    ).resolves.toEqual({
      error: 'ERP Core API returned an invalid claim document result.',
      outcome: 'unknown',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('lists only the claim project through the paginated Core reader', async () => {
    await expect(
      listClaimDocuments(CLAIM_ID, { page: 3, limit: 25 }),
    ).resolves.toEqual({ ok: true, data: DOCUMENT_RESULT })
    expect(mocks.getProjectDocumentsThroughCoreApi).toHaveBeenCalledWith(
      PROJECT_ID,
      { page: 3, limit: 25 },
    )
  })

  it('fails closed before Core access when the caller lacks document.manage', async () => {
    mocks.can.mockReturnValue(false)

    await expect(
      listClaimDocuments(CLAIM_ID, { page: 1, limit: 25 }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('permission') })
    expect(mocks.getProjectDocumentsThroughCoreApi).not.toHaveBeenCalled()
  })
})
