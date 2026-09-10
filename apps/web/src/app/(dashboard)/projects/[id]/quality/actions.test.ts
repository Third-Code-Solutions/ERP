import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  createQualityHoldPointThroughCoreApi: vi.fn(),
  mutateQualityHoldPointThroughCoreApi: vi.fn(),
  handoffQualityHoldPointToPunchlistThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@third-code-erp/auth', () => ({ requireUserProfile: mocks.requireUserProfile, can: mocks.can }))
vi.mock('@/lib/erp-core-client', () => ({
  createQualityHoldPointThroughCoreApi: mocks.createQualityHoldPointThroughCoreApi,
  mutateQualityHoldPointThroughCoreApi: mocks.mutateQualityHoldPointThroughCoreApi,
  handoffQualityHoldPointToPunchlistThroughCoreApi: mocks.handoffQualityHoldPointToPunchlistThroughCoreApi,
}))

import { createQualityHoldPoint, handoffQualityHoldPointToPunchlist, transitionQualityHoldPoint, updateQualityHoldPoint } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ENTRY_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const PROFILE = { user: { id: USER_ID }, tenantId: TENANT_ID, role: 'pm', email: 'pm@example.test', fullName: 'Project Manager' }

function entry(status = 'planned', version = 1) {
  return {
    id: ENTRY_ID,
    projectId: PROJECT_ID,
    iwrNumber: 'IWR-0001',
    title: 'Concrete pour inspection',
    description: 'Verify reinforcement before the pour.',
    discipline: 'Structural',
    location: 'Level 2 slab',
    planReference: 'S-201 detail 4',
    holdPoint: true,
    inspectionDate: '2026-09-12',
    status,
    requestNotes: '',
    findings: '',
    rejectionReason: '',
    acceptanceNotes: '',
    requestedBy: USER_ID,
    assignedTo: null,
    submittedAt: status === 'submitted' ? '2026-09-10T01:00:00.000Z' : null,
    submittedBy: status === 'submitted' ? USER_ID : null,
    acceptedAt: null,
    acceptedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    punchlistHandoffAt: null,
    punchlistHandoffBy: null,
    version,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
  }
}

function createForm(): FormData {
  const form = new FormData()
  form.set('projectId', PROJECT_ID); form.set('clientRequestId', REQUEST_ID); form.set('title', 'Concrete pour inspection'); form.set('description', 'Verify reinforcement before the pour.'); form.set('discipline', 'Structural'); form.set('location', 'Level 2 slab'); form.set('planReference', 'S-201 detail 4'); form.set('holdPoint', 'true'); form.set('inspectionDate', '2026-09-12'); form.set('assignedTo', '')
  return form
}

describe('quality hold point server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(true)
    mocks.createQualityHoldPointThroughCoreApi.mockResolvedValue({ ok: true, data: { projectId: PROJECT_ID, created: true, changed: true, entry: entry() } })
    mocks.mutateQualityHoldPointThroughCoreApi.mockResolvedValue({ ok: true, data: { projectId: PROJECT_ID, changed: true, entry: entry('submitted', 2) } })
    mocks.handoffQualityHoldPointToPunchlistThroughCoreApi.mockResolvedValue({ ok: true, data: {
      projectId: PROJECT_ID,
      qualityHoldPointId: ENTRY_ID,
      handoffId: '66666666-6666-4666-8666-666666666666',
      created: true,
      changed: true,
      source: { qualityHoldPointId: ENTRY_ID, iwrNumber: 'IWR-0001', findings: 'Defect.', rejectionReason: 'Repair.', planDocumentId: null },
      items: [{ id: '77777777-7777-4777-8777-777777777777', projectId: PROJECT_ID, description: 'Repair.', location: null, trade: null, priority: 'medium', status: 'open', dueDate: null, assignedToUserId: null, assignedToText: null, createdAt: '2026-09-10T02:00:00.000Z', createdBy: USER_ID, sourceHandoffId: '66666666-6666-4666-8666-666666666666' }],
    } })
  })

  it('creates through Core with replay identity and strict fields', async () => {
    await expect(createQualityHoldPoint({ ok: true }, createForm())).resolves.toEqual({ ok: true, success: 'IWR-0001 created.' })
    expect(mocks.createQualityHoldPointThroughCoreApi).toHaveBeenCalledWith(expect.objectContaining({ projectId: PROJECT_ID, clientRequestId: REQUEST_ID, holdPoint: true }))
  })

  it('routes update and submit with optimistic versions', async () => {
    const update = new FormData()
    update.set('projectId', PROJECT_ID); update.set('entryId', ENTRY_ID); update.set('expectedVersion', '1'); update.set('title', 'Updated IWR'); update.set('description', 'Updated scope'); update.set('discipline', 'Structural'); update.set('location', 'Level 2'); update.set('planReference', 'S-201'); update.set('holdPoint', 'true'); update.set('inspectionDate', '2026-09-12'); update.set('assignedTo', '')
    await expect(updateQualityHoldPoint({ ok: true }, update)).resolves.toEqual({ ok: true, success: 'Quality request updated.' })
    expect(mocks.mutateQualityHoldPointThroughCoreApi).toHaveBeenCalledWith(PROJECT_ID, ENTRY_ID, 'update', expect.objectContaining({ expectedVersion: 1 }))
    const submit = new FormData(); submit.set('projectId', PROJECT_ID); submit.set('entryId', ENTRY_ID); submit.set('target', 'submit'); submit.set('expectedVersion', '2'); submit.set('requestNotes', 'Inspect before pour.')
    await expect(transitionQualityHoldPoint({ ok: true }, submit)).resolves.toEqual({ ok: true, success: 'IWR submitted for inspection.' })
    expect(mocks.mutateQualityHoldPointThroughCoreApi).toHaveBeenCalledWith(PROJECT_ID, ENTRY_ID, 'submit', { expectedVersion: 2, requestNotes: 'Inspect before pour.' })
  })

  it('fails closed for unauthorized roles and invalid Core scope', async () => {
    mocks.can.mockReturnValue(false)
    await expect(createQualityHoldPoint({ ok: true }, createForm())).resolves.toEqual({ ok: false, error: 'You do not have permission to create quality requests.' })
    mocks.can.mockReturnValue(true)
    mocks.createQualityHoldPointThroughCoreApi.mockResolvedValueOnce({ ok: true, data: { projectId: PROJECT_ID, created: true, changed: true, entry: { ...entry(), projectId: '66666666-6666-4666-8666-666666666666' } } })
    await expect(createQualityHoldPoint({ ok: true }, createForm())).resolves.toEqual({ ok: false, error: 'ERP Core API returned an invalid quality scope.' })
  })

  it('creates one-or-more punchlist corrections through Core with stable replay identity', async () => {
    mocks.can.mockReturnValue(true)
    const form = new FormData()
    form.set('projectId', PROJECT_ID); form.set('entryId', ENTRY_ID); form.set('clientRequestId', REQUEST_ID)
    form.set('descriptions', 'Repair membrane.\nReinspect north wall.')
    form.set('location', 'Level 2'); form.set('trade', 'Waterproofing'); form.set('priority', 'high'); form.set('dueDate', '2026-09-20'); form.set('planDocumentId', ''); form.set('assignedToText', 'Subcontractor')
    await expect(handoffQualityHoldPointToPunchlist({ ok: true }, form)).resolves.toEqual({ ok: true, success: '1 punchlist item created from IWR-0001.' })
    expect(mocks.handoffQualityHoldPointToPunchlistThroughCoreApi).toHaveBeenCalledWith(PROJECT_ID, ENTRY_ID, expect.objectContaining({ clientRequestId: REQUEST_ID, items: expect.any(Array) }))
    const command = mocks.handoffQualityHoldPointToPunchlistThroughCoreApi.mock.calls[0]?.[2] as { items: Array<{ description: string; dueDate: string | null }> }
    expect(command.items).toHaveLength(2)
    expect(command.items[0]?.dueDate).toBe('2026-09-20T00:00:00.000Z')
  })

  it('rejects impossible calendar dates instead of normalizing them', async () => {
    const form = new FormData()
    form.set('projectId', PROJECT_ID); form.set('entryId', ENTRY_ID); form.set('clientRequestId', REQUEST_ID)
    form.set('descriptions', 'Repair membrane.'); form.set('dueDate', '2026-02-30')
    await expect(handoffQualityHoldPointToPunchlist({ ok: true }, form)).resolves.toMatchObject({ ok: false })
    expect(mocks.handoffQualityHoldPointToPunchlistThroughCoreApi).not.toHaveBeenCalled()
  })
})
