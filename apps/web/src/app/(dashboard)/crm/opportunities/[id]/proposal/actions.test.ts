import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  changeRequestWritesUseCoreApi: vi.fn(),
  createChangeRequestThroughCoreApi: vi.fn(),
  submitResubmission: vi.fn(),
  submitInspection: vi.fn(),
  createRfi: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))

vi.mock('@third-code-erp/database/schema', () => ({
  opportunities: {
    id: 'opportunities.id',
    project_id: 'opportunities.project_id',
    tenant_id: 'opportunities.tenant_id',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
}))

vi.mock('@/lib/erp-core-client', () => ({
  changeRequestWritesUseCoreApi: mocks.changeRequestWritesUseCoreApi,
  createChangeRequestThroughCoreApi:
    mocks.createChangeRequestThroughCoreApi,
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/operations/sla-clock', () => ({
  startSlaClock: vi.fn(),
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: vi.fn(),
}))

vi.mock('@/lib/inngest', () => ({
  inngest: {},
}))

vi.mock('@/lib/pdf/site-inspection-report', () => ({
  buildInspectionReportHtml: vi.fn(),
}))

vi.mock('@/server/crm/pprf-submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/crm/pprf-submission-service')>()
  return {
    ...actual,
    pprfSubmissionService: {
      submitResubmission: mocks.submitResubmission,
    },
  }
})

vi.mock('@/server/crm/site-inspection-workflow-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/crm/site-inspection-workflow-service')>()
  return {
    ...actual,
    siteInspectionWorkflowService: {
      submitInspection: mocks.submitInspection,
      createRfi: mocks.createRfi,
    },
  }
})

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { addInspectionRfi, logChangeRequest, submitInspection, submitPprf } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const DESIGN_FILE_ID = '44444444-4444-4444-8444-444444444444'
const SUBMISSION_ID = '55555555-5555-4555-8555-555555555555'
const PPRF_ID = '66666666-6666-4666-8666-666666666666'
const INSPECTION_ID = '77777777-7777-4777-8777-777777777777'
const RFI_ID = '88888888-8888-4888-8888-888888888888'
const PHOTO_ID = '99999999-9999-4999-8999-999999999999'
const ROLES = [
  'owner', 'estimator', 'pm', 'admin', 'sales', 'commercial', 'design',
  'sd_pm_pe', 'finance', 'procurement', 'safety', 'cx', 'viewer',
] as const

function selectOpportunity(): void {
  const limit = vi.fn().mockResolvedValue([
    { id: OPPORTUNITY_ID, project_id: null },
  ])
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  mocks.select.mockReturnValue({ from })
}

function changeRequestForm(idempotencyKey?: string): FormData {
  const form = new FormData()
  form.set('opportunity_id', OPPORTUNITY_ID)
  form.set('requested_by_name', 'Client A')
  form.set('description', 'Move the kitchen island 300mm east.')
  form.set('priority', 'major')
  form.set('affected_design_file_id', DESIGN_FILE_ID)
  if (idempotencyKey) form.set('idempotency_key', idempotencyKey)
  return form
}

describe('Change Request migration switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'admin',
    })
    mocks.can.mockReturnValue(true)
    mocks.changeRequestWritesUseCoreApi.mockReturnValue(true)
    mocks.createChangeRequestThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        changeRequestId: '55555555-5555-4555-8555-555555555555',
        tenantId: TENANT_ID,
        status: 'open',
        created: true,
      },
    })
    selectOpportunity()
  })

  it('routes the gated form command through Nest with its retry token', async () => {
    await expect(
      logChangeRequest(changeRequestForm('change-request-form-1'))
    ).resolves.toEqual({})

    expect(mocks.can).toHaveBeenCalledWith('admin', 'change_request.create')
    expect(mocks.changeRequestWritesUseCoreApi).toHaveBeenCalledWith(
      TENANT_ID
    )
    expect(mocks.createChangeRequestThroughCoreApi).toHaveBeenCalledWith(
      OPPORTUNITY_ID,
      {
        requestedByName: 'Client A',
        description: 'Move the kitchen island 300mm east.',
        priority: 'major',
        affectedDesignFileId: DESIGN_FILE_ID,
      },
      'change-request-form-1'
    )
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2)
  })

  it('generates a bounded retry token for older callers without one', async () => {
    await expect(logChangeRequest(changeRequestForm())).resolves.toEqual({})

    const key = mocks.createChangeRequestThroughCoreApi.mock.calls[0]?.[2]
    expect(key).toEqual(expect.any(String))
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
})

function pprfForm(): FormData {
  const form = new FormData()
  form.set('submission_id', SUBMISSION_ID)
  form.set('site_address', 'Makati City')
  form.set('floor_area_sqm', '45.5')
  form.set('landlord_contact', 'Jane Doe')
  form.set('as_built_available', 'partial')
  form.set('scope_notes', 'Retain this on failure.')
  form.set('project_type', 'Retail')
  form.set('expected_start_date', '2026-10-01')
  form.set('budget_range', 'PHP 1M-2M')
  return form
}

describe('submitPprf service integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.revalidatePath.mockReset()
    mocks.requireUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'sales',
    })
    mocks.can.mockReturnValue(true)
    mocks.submitResubmission.mockResolvedValue({
      ok: true,
      kind: 'resubmission',
      tenantId: TENANT_ID,
      opportunityId: OPPORTUNITY_ID,
      pprfSubmissionId: PPRF_ID,
      version: 2,
      replayed: false,
    })
  })

  it('binds opportunity identity outside FormData and calls the service once', async () => {
    await expect(submitPprf(OPPORTUNITY_ID, pprfForm())).resolves.toMatchObject({
      ok: true,
      opportunityId: OPPORTUNITY_ID,
      version: 2,
    })
    expect(mocks.submitResubmission).toHaveBeenCalledTimes(1)
    expect(mocks.submitResubmission).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, userId: USER_ID },
      expect.objectContaining({ submissionId: SUBMISSION_ID, opportunityId: OPPORTUNITY_ID })
    )
  })

  it('rejects hostile identity and duplicate fields before the service', async () => {
    const form = pprfForm()
    form.set('opportunity_id', '77777777-7777-4777-8777-777777777777')
    form.append('site_address', 'Second address')
    await expect(submitPprf(OPPORTUNITY_ID, form)).resolves.toMatchObject({ ok: false })
    expect(mocks.submitResubmission).not.toHaveBeenCalled()
  })

  it('does not turn a committed result into failure when refresh throws', async () => {
    mocks.revalidatePath.mockImplementation(() => {
      throw new Error('cache unavailable')
    })
    await expect(submitPprf(OPPORTUNITY_ID, pprfForm())).resolves.toMatchObject({
      ok: true,
      refreshFailed: true,
    })
  })

  it.each(ROLES)('projects exact resubmission authority for %s', async (role) => {
    mocks.requireUserProfile.mockResolvedValue({
      user: { id: USER_ID }, tenantId: TENANT_ID, role,
    })
    mocks.can.mockImplementation((actualRole: string, capability: string) =>
      actualRole === role && capability === 'pprf.submit' &&
      ['owner', 'admin', 'sales'].includes(role)
    )
    const result = await submitPprf(OPPORTUNITY_ID, pprfForm())
    expect(result.ok).toBe(['owner', 'admin', 'sales'].includes(role))
    expect(mocks.submitResubmission).toHaveBeenCalledTimes(result.ok ? 1 : 0)
  })

  it('contains service errors, malformed responses, and scope mismatches', async () => {
    mocks.submitResubmission.mockResolvedValueOnce({
      ok: false, error: { code: 'CONFLICT', message: 'Submission conflict.' },
    })
    await expect(submitPprf(OPPORTUNITY_ID, pprfForm())).resolves.toEqual({
      ok: false, error: 'Submission conflict.',
    })
    mocks.submitResubmission.mockResolvedValueOnce({ ok: true })
    await expect(submitPprf(OPPORTUNITY_ID, pprfForm())).resolves.toMatchObject({ ok: false })
    mocks.submitResubmission.mockResolvedValueOnce({
      ok: true, kind: 'resubmission', tenantId: TENANT_ID,
      opportunityId: '77777777-7777-4777-8777-777777777777',
      pprfSubmissionId: PPRF_ID, version: 2, replayed: false,
    })
    await expect(submitPprf(OPPORTUNITY_ID, pprfForm())).resolves.toMatchObject({ ok: false })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('contains missing auth and thrown service failures', async () => {
    mocks.requireUserProfile.mockRejectedValueOnce(new Error('no session'))
    await expect(submitPprf(OPPORTUNITY_ID, pprfForm())).resolves.toMatchObject({ ok: false })
    mocks.submitResubmission.mockRejectedValueOnce(new Error('transport failed'))
    await expect(submitPprf(OPPORTUNITY_ID, pprfForm())).resolves.toMatchObject({ ok: false })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('keeps the PPRF action slice free of local durable side effects', () => {
    const source = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8')
    const start = source.indexOf('export async function submitPprf')
    const end = source.indexOf('// US-007', start)
    const slice = source.slice(start, end)
    expect(slice).toContain('pprfSubmissionService.submitResubmission')
    expect(slice).not.toContain('db.')
    expect(slice).not.toContain('writeAuditLog')
    expect(slice).not.toContain('startSlaClock')
    expect(slice).not.toContain('notifyRoles')
  })
})

function inspectionForm(): FormData {
  const form = new FormData()
  form.set('client_submission_id', SUBMISSION_ID)
  form.set('site_address', '  Makati City  ')
  form.set('floor_area_sqm', '45.5')
  form.set('landlord_contact', 'Jane Doe')
  form.set('as_built_available', 'partial')
  form.set('expected_start_date', '2026-10-01')
  form.set('weather', 'Sunny')
  form.set('accessibility_notes', 'Service elevator')
  form.set('observations', 'Existing ceiling retained')
  form.set('photo_document_ids', JSON.stringify([PHOTO_ID]))
  return form
}

function rfiForm(): FormData {
  const form = new FormData()
  form.set('submission_id', SUBMISSION_ID)
  form.set('description', '  Confirm slab penetration location.  ')
  form.set('priority', 'major')
  return form
}

describe('site inspection atomic service mounting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.revalidatePath.mockReset()
    mocks.requireUserProfile.mockResolvedValue({
      user: { id: USER_ID }, tenantId: TENANT_ID, role: 'commercial',
    })
    mocks.can.mockReturnValue(true)
    mocks.submitInspection.mockResolvedValue({
      ok: true, kind: 'inspection_submission', tenantId: TENANT_ID,
      actorId: USER_ID, opportunityId: OPPORTUNITY_ID,
      inspectionId: INSPECTION_ID, status: 'submitted',
      submittedAt: '2026-09-03T01:02:03.000Z', linkedPhotoCount: 1,
      replayed: true,
    })
    mocks.createRfi.mockResolvedValue({
      ok: true, kind: 'rfi_creation', tenantId: TENANT_ID,
      actorId: USER_ID, opportunityId: OPPORTUNITY_ID,
      inspectionId: INSPECTION_ID, rfiId: RFI_ID, priority: 'major',
      createdAt: '2026-09-03T01:03:03.000Z', replayed: false,
    })
  })

  it('binds inspection identity server-side and calls the service exactly once', async () => {
    await expect(submitInspection(OPPORTUNITY_ID, inspectionForm())).resolves.toMatchObject({
      ok: true, inspectionId: INSPECTION_ID, replayed: true,
    })
    expect(mocks.submitInspection).toHaveBeenCalledTimes(1)
    expect(mocks.submitInspection).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, userId: USER_ID },
      {
        kind: 'inspection_submission', submissionId: SUBMISSION_ID,
        opportunityId: OPPORTUNITY_ID,
        payload: {
          siteAddress: 'Makati City', floorAreaSqm: '45.5', landlordContact: 'Jane Doe',
          asBuiltAvailable: 'partial', expectedStartDate: '2026-10-01', weather: 'Sunny',
          accessibilityNotes: 'Service elevator', observations: 'Existing ceiling retained',
        },
        photoDocumentIds: [PHOTO_ID],
      },
    )
  })

  it('rejects unknown, duplicate, and hostile inspection fields before service', async () => {
    const form = inspectionForm()
    form.set('tenant_id', TENANT_ID)
    form.set('opportunity_id', OPPORTUNITY_ID)
    form.append('site_address', 'duplicate')
    await expect(submitInspection(OPPORTUNITY_ID, form)).resolves.toMatchObject({ ok: false })
    expect(mocks.submitInspection).not.toHaveBeenCalled()
  })

  it('contains service rejection, throws, malformed results, and scope mismatches', async () => {
    mocks.submitInspection.mockResolvedValueOnce({
      ok: false, error: { code: 'PPRF_REQUIRED', message: 'Submit the PPRF first.' },
    })
    await expect(submitInspection(OPPORTUNITY_ID, inspectionForm())).resolves.toEqual({
      ok: false, error: 'Submit the PPRF first.',
    })
    mocks.submitInspection.mockRejectedValueOnce(new Error('transaction unavailable'))
    await expect(submitInspection(OPPORTUNITY_ID, inspectionForm())).resolves.toMatchObject({ ok: false })
    mocks.submitInspection.mockResolvedValueOnce({ ok: true })
    await expect(submitInspection(OPPORTUNITY_ID, inspectionForm())).resolves.toMatchObject({ ok: false })
    mocks.submitInspection.mockResolvedValueOnce({
      ok: true, kind: 'inspection_submission', tenantId: TENANT_ID,
      actorId: USER_ID, opportunityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      inspectionId: INSPECTION_ID, status: 'submitted',
      submittedAt: '2026-09-03T01:02:03.000Z', linkedPhotoCount: 1, replayed: false,
    })
    await expect(submitInspection(OPPORTUNITY_ID, inspectionForm())).resolves.toMatchObject({ ok: false })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('contains missing inspection auth without calling the service', async () => {
    mocks.requireUserProfile.mockRejectedValueOnce(new Error('no session'))
    await expect(submitInspection(OPPORTUNITY_ID, inspectionForm())).resolves.toMatchObject({ ok: false })
    expect(mocks.submitInspection).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each(ROLES)('projects exact inspection mutation authority for %s', async (role) => {
    mocks.requireUserProfile.mockResolvedValue({ user: { id: USER_ID }, tenantId: TENANT_ID, role })
    mocks.can.mockImplementation((actualRole: string, capability: string) =>
      actualRole === role && capability === 'site_inspection.submit' &&
      ['owner', 'admin', 'commercial'].includes(role)
    )
    const result = await submitInspection(OPPORTUNITY_ID, inspectionForm())
    expect(result.ok).toBe(['owner', 'admin', 'commercial'].includes(role))
    expect(mocks.submitInspection).toHaveBeenCalledTimes(result.ok ? 1 : 0)
  })

  it('keeps committed inspection and RFI success when refresh fails', async () => {
    mocks.revalidatePath.mockImplementation(() => { throw new Error('cache unavailable') })
    await expect(submitInspection(OPPORTUNITY_ID, inspectionForm())).resolves.toMatchObject({
      ok: true, refreshFailed: true,
    })
    await expect(addInspectionRfi(OPPORTUNITY_ID, INSPECTION_ID, rfiForm())).resolves.toMatchObject({
      ok: true, refreshFailed: true,
    })
  })

  it('reports archive failure as a warning without reversing committed success', async () => {
    mocks.submitInspection.mockResolvedValueOnce({
      ok: true, kind: 'inspection_submission', tenantId: TENANT_ID,
      actorId: USER_ID, opportunityId: OPPORTUNITY_ID,
      inspectionId: INSPECTION_ID, status: 'submitted',
      submittedAt: '2026-09-03T01:02:03.000Z', linkedPhotoCount: 1,
      replayed: false,
    })
    await expect(submitInspection(OPPORTUNITY_ID, inspectionForm())).resolves.toMatchObject({
      ok: true,
      archiveWarning: expect.stringContaining('report could not be archived'),
    })
    expect(mocks.submitInspection).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).toHaveBeenCalled()
  })

  it('binds RFI identities server-side, calls service once, and rejects hostile inventory', async () => {
    await expect(addInspectionRfi(OPPORTUNITY_ID, INSPECTION_ID, rfiForm())).resolves.toMatchObject({
      ok: true, rfiId: RFI_ID,
    })
    expect(mocks.createRfi).toHaveBeenCalledTimes(1)
    expect(mocks.createRfi).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, userId: USER_ID },
      {
        kind: 'rfi_creation', submissionId: SUBMISSION_ID,
        opportunityId: OPPORTUNITY_ID, inspectionId: INSPECTION_ID,
        description: 'Confirm slab penetration location.', priority: 'major',
      },
    )
    const hostile = rfiForm()
    hostile.set('inspection_id', INSPECTION_ID)
    await expect(addInspectionRfi(OPPORTUNITY_ID, INSPECTION_ID, hostile)).resolves.toMatchObject({ ok: false })
    expect(mocks.createRfi).toHaveBeenCalledTimes(1)
  })

  it.each(ROLES)('projects exact RFI mutation authority for %s', async (role) => {
    mocks.requireUserProfile.mockResolvedValue({ user: { id: USER_ID }, tenantId: TENANT_ID, role })
    mocks.can.mockImplementation((actualRole: string, capability: string) =>
      actualRole === role && capability === 'site_inspection.submit' &&
      ['owner', 'admin', 'commercial'].includes(role)
    )
    const result = await addInspectionRfi(OPPORTUNITY_ID, INSPECTION_ID, rfiForm())
    expect(result.ok).toBe(['owner', 'admin', 'commercial'].includes(role))
    expect(mocks.createRfi).toHaveBeenCalledTimes(result.ok ? 1 : 0)
  })

  it('contains RFI rejection, throws, malformed results, scope mismatch, and missing auth', async () => {
    mocks.createRfi.mockResolvedValueOnce({
      ok: false, error: { code: 'CONFLICT', message: 'RFI submission conflict.' },
    })
    await expect(addInspectionRfi(OPPORTUNITY_ID, INSPECTION_ID, rfiForm())).resolves.toEqual({
      ok: false, error: 'RFI submission conflict.',
    })
    mocks.createRfi.mockRejectedValueOnce(new Error('transaction unavailable'))
    await expect(addInspectionRfi(OPPORTUNITY_ID, INSPECTION_ID, rfiForm())).resolves.toMatchObject({ ok: false })
    mocks.createRfi.mockResolvedValueOnce({ ok: true })
    await expect(addInspectionRfi(OPPORTUNITY_ID, INSPECTION_ID, rfiForm())).resolves.toMatchObject({ ok: false })
    mocks.createRfi.mockResolvedValueOnce({
      ok: true, kind: 'rfi_creation', tenantId: TENANT_ID,
      actorId: USER_ID, opportunityId: OPPORTUNITY_ID,
      inspectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      rfiId: RFI_ID, priority: 'major', createdAt: '2026-09-03T01:03:03.000Z', replayed: false,
    })
    await expect(addInspectionRfi(OPPORTUNITY_ID, INSPECTION_ID, rfiForm())).resolves.toMatchObject({ ok: false })
    mocks.requireUserProfile.mockRejectedValueOnce(new Error('no session'))
    await expect(addInspectionRfi(OPPORTUNITY_ID, INSPECTION_ID, rfiForm())).resolves.toMatchObject({ ok: false })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('keeps both action slices free of legacy durable writers', () => {
    const source = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8')
    const inspectionStart = source.indexOf('export async function submitInspection')
    const rfiStart = source.indexOf('export async function addInspectionRfi', inspectionStart)
    const nextAction = source.indexOf('// US-008', rfiStart)
    const inspectionSlice = source.slice(inspectionStart, rfiStart)
    const rfiSlice = source.slice(rfiStart, nextAction)
    expect(inspectionSlice.match(/siteInspectionWorkflowService\.submitInspection/g)).toHaveLength(1)
    expect(rfiSlice.match(/siteInspectionWorkflowService\.createRfi/g)).toHaveLength(1)
    for (const slice of [inspectionSlice, rfiSlice]) {
      expect(slice).not.toContain('db.')
      expect(slice).not.toContain('writeAuditLog')
      expect(slice).not.toContain('startSlaClock')
      expect(slice).not.toContain('notifyRoles')
    }
  })
})
