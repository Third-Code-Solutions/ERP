import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  transaction: vi.fn(),
  createChangeRequestRecord: vi.fn(),
  resolveChangeRequestRecord: vi.fn(),
  notifyRoles: vi.fn(),
  revalidatePath: vi.fn(),
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  startSlaClock: vi.fn(),
  opportunityKycDueAt: vi.fn(),
  initializeOpportunityKycTracks: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  inngest: { send: vi.fn() },
  buildInspectionReportHtml: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { transaction: mocks.transaction },
  pprfSubmissions: {},
  siteInspections: {},
  siteInspectionPhotos: {},
  siteInspectionRfis: {},
  designFiles: {},
  designFileVersions: {},
  opportunities: {},
  documents: {},
  accounts: {},
  projects: {},
  tenants: {},
  users: {},
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

vi.mock('@/lib/operations/sla-clock', () => ({
  startSlaClock: mocks.startSlaClock,
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: mocks.notifyRoles,
}))

vi.mock('@/lib/operations/opportunity-kyc', () => ({
  initializeOpportunityKycTracks: mocks.initializeOpportunityKycTracks,
  opportunityKycDueAt: mocks.opportunityKycDueAt,
}))

vi.mock('@/lib/inngest', () => ({
  inngest: mocks.inngest,
}))

vi.mock('@/lib/pdf/site-inspection-report', () => ({
  buildInspectionReportHtml: mocks.buildInspectionReportHtml,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('./change-request-workflow', () => ({
  createChangeRequestRecord: mocks.createChangeRequestRecord,
  resolveChangeRequestRecord: mocks.resolveChangeRequestRecord,
}))

import { logChangeRequest, resolveChangeRequest } from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const REQUEST_ID = '44444444-4444-4444-8444-444444444444'

function createRequestForm(): FormData {
  const formData = new FormData()
  formData.set('opportunity_id', OPPORTUNITY_ID)
  formData.set('requested_by_name', 'Client contact')
  formData.set('description', 'Move reception counter 300 mm east.')
  formData.set('priority', 'major')
  formData.set('idempotency_key', '2f7d2d9e-7e5a-4f70-bf6d-8b4f0e9d8f2b')
  return formData
}

describe('proposal change-request actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'sales',
      user: { id: ACTOR_ID },
    })
    mocks.can.mockReturnValue(true)
    mocks.transaction.mockImplementation(async (callback: (tx: object) => Promise<unknown>) =>
      callback({}),
    )
    mocks.createChangeRequestRecord.mockResolvedValue({
      changeRequestId: REQUEST_ID,
      replayed: false,
    })
    mocks.resolveChangeRequestRecord.mockResolvedValue({
      opportunityId: OPPORTUNITY_ID,
      alreadyResolved: false,
    })
    mocks.notifyRoles.mockResolvedValue(undefined)
  })

  it('derives tenant and actor from the signed-in profile', async () => {
    await expect(logChangeRequest(createRequestForm())).resolves.toEqual({})

    expect(mocks.createChangeRequestRecord).toHaveBeenCalledWith(
      expect.any(Object),
      {
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        opportunityId: OPPORTUNITY_ID,
        requestedByName: 'Client contact',
        description: 'Move reception counter 300 mm east.',
        priority: 'major',
        affectedDesignFileId: null,
        idempotencyKey: '2f7d2d9e-7e5a-4f70-bf6d-8b4f0e9d8f2b',
      },
    )
    expect(mocks.notifyRoles).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      '/crm/opportunities/' + OPPORTUNITY_ID + '/proposal/change-requests',
    )
  })

  it('rejects unkeyed requests before transaction authority', async () => {
    const formData = createRequestForm()
    formData.delete('idempotency_key')

    await expect(logChangeRequest(formData)).resolves.toMatchObject({
      error: expect.stringContaining('idempotency_key'),
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.createChangeRequestRecord).not.toHaveBeenCalled()
  })

  it('does not notify again when transaction reports an idempotent replay', async () => {
    mocks.createChangeRequestRecord.mockResolvedValue({
      changeRequestId: REQUEST_ID,
      replayed: true,
    })

    await expect(logChangeRequest(createRequestForm())).resolves.toEqual({})

    expect(mocks.notifyRoles).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      '/crm/opportunities/' + OPPORTUNITY_ID + '/proposal/change-requests',
    )
  })

  it('requires design capability and records resolution through transaction service', async () => {
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'design',
      user: { id: ACTOR_ID },
    })
    const formData = new FormData()
    formData.set('change_request_id', REQUEST_ID)
    formData.set('resolution_note', 'Updated reflected ceiling plan.')

    await expect(resolveChangeRequest(formData)).resolves.toEqual({})

    expect(mocks.resolveChangeRequestRecord).toHaveBeenCalledWith(
      expect.any(Object),
      {
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        changeRequestId: REQUEST_ID,
        resolutionNote: 'Updated reflected ceiling plan.',
      },
    )
    expect(mocks.notifyRoles).toHaveBeenCalledOnce()
  })

  it('fails closed before database access when capability is missing', async () => {
    mocks.can.mockReturnValue(false)

    await expect(logChangeRequest(createRequestForm())).resolves.toEqual({
      error: 'Forbidden: role "sales" lacks "pprf.submit"',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
