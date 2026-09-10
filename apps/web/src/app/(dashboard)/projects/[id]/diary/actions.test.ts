import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  createSiteDiaryThroughCoreApi: vi.fn(),
  mutateSiteDiaryThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))
vi.mock('@/lib/erp-core-client', () => ({
  createSiteDiaryThroughCoreApi: mocks.createSiteDiaryThroughCoreApi,
  mutateSiteDiaryThroughCoreApi: mocks.mutateSiteDiaryThroughCoreApi,
}))

import { createSiteDiary, submitSiteDiary, updateSiteDiary } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ENTRY_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const PROFILE = {
  user: { id: USER_ID },
  tenantId: TENANT_ID,
  role: 'pm',
  email: 'pm@example.test',
  fullName: 'Project Manager',
}

function entry(status = 'draft', version = 1) {
  return {
    id: ENTRY_ID,
    projectId: PROJECT_ID,
    diaryDate: '2026-09-10',
    status,
    weather: 'Cloudy',
    manpowerCount: 14,
    workCompleted: 'MEP rough-in progressed.',
    constraints: '',
    safetyNotes: 'PPE checked.',
    createdBy: USER_ID,
    submittedAt: status === 'submitted' ? '2026-09-10T09:00:00.000Z' : null,
    submittedBy: status === 'submitted' ? USER_ID : null,
    version,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T09:00:00.000Z',
  }
}

function createForm(): FormData {
  const form = new FormData()
  form.set('projectId', PROJECT_ID)
  form.set('clientRequestId', REQUEST_ID)
  form.set('diaryDate', '2026-09-10')
  form.set('weather', 'Cloudy')
  form.set('manpowerCount', '14')
  form.set('workCompleted', 'MEP rough-in progressed.')
  form.set('constraints', '')
  form.set('safetyNotes', 'PPE checked.')
  return form
}

function updateForm(version = '1'): FormData {
  const form = new FormData()
  form.set('projectId', PROJECT_ID)
  form.set('entryId', ENTRY_ID)
  form.set('expectedVersion', version)
  form.set('weather', 'Sunny')
  form.set('manpowerCount', '16')
  form.set('workCompleted', 'Updated work.')
  form.set('constraints', '')
  form.set('safetyNotes', 'PPE checked.')
  return form
}

describe('site diary server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(true)
    mocks.createSiteDiaryThroughCoreApi.mockResolvedValue({
      ok: true,
      data: { projectId: PROJECT_ID, created: true, changed: true, entry: entry() },
    })
    mocks.mutateSiteDiaryThroughCoreApi.mockResolvedValue({
      ok: true,
      data: { projectId: PROJECT_ID, changed: true, entry: entry('submitted', 2) },
    })
  })

  it('creates through Core with stable request identity', async () => {
    await expect(createSiteDiary({ ok: true }, createForm())).resolves.toEqual({
      ok: true,
      success: 'Diary for 2026-09-10 created.',
    })
    expect(mocks.createSiteDiaryThroughCoreApi).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      diaryDate: '2026-09-10',
      weather: 'Cloudy',
      manpowerCount: 14,
      workCompleted: 'MEP rough-in progressed.',
      constraints: '',
      safetyNotes: 'PPE checked.',
    })
  })

  it('routes draft update and submit with version tokens', async () => {
    await expect(updateSiteDiary({ ok: true }, updateForm())).resolves.toEqual({ ok: true, success: 'Diary updated.' })
    expect(mocks.mutateSiteDiaryThroughCoreApi).toHaveBeenCalledWith(
      PROJECT_ID,
      ENTRY_ID,
      'update',
      expect.objectContaining({ expectedVersion: 1, manpowerCount: 16 }),
    )
    const submit = new FormData()
    submit.set('projectId', PROJECT_ID)
    submit.set('entryId', ENTRY_ID)
    submit.set('expectedVersion', '2')
    await expect(submitSiteDiary({ ok: true }, submit)).resolves.toEqual({ ok: true, success: 'Diary submitted.' })
    expect(mocks.mutateSiteDiaryThroughCoreApi).toHaveBeenCalledWith(PROJECT_ID, ENTRY_ID, 'submit', { expectedVersion: 2 })
  })

  it('fails closed for unauthorized roles and invalid Core scope', async () => {
    mocks.can.mockReturnValue(false)
    await expect(createSiteDiary({ ok: true }, createForm())).resolves.toEqual({
      ok: false,
      error: 'You do not have permission to create site diary entries.',
    })
    mocks.can.mockReturnValue(true)
    mocks.createSiteDiaryThroughCoreApi.mockResolvedValueOnce({
      ok: true,
      data: { projectId: PROJECT_ID, created: true, changed: true, entry: { ...entry(), projectId: '66666666-6666-4666-8666-666666666666' } },
    })
    await expect(createSiteDiary({ ok: true }, createForm())).resolves.toEqual({
      ok: false,
      error: 'ERP Core API returned an invalid site diary scope.',
    })
  })
})
