import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  createProjectRfiThroughCoreApi: vi.fn(),
  transitionProjectRfiThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))
vi.mock('@/lib/erp-core-client', () => ({
  createProjectRfiThroughCoreApi: mocks.createProjectRfiThroughCoreApi,
  transitionProjectRfiThroughCoreApi: mocks.transitionProjectRfiThroughCoreApi,
}))

import { createProjectRfi, transitionProjectRfi } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const RFI_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const PROFILE = {
  user: { id: USER_ID },
  tenantId: TENANT_ID,
  role: 'pm',
  email: 'pm@example.test',
  fullName: 'Project Manager',
}

function row(status = 'open', version = 1) {
  return {
    id: RFI_ID,
    projectId: PROJECT_ID,
    rfiNumber: 'RFI-0001',
    subject: 'Confirm opening',
    question: 'Please confirm the opening size.',
    priority: 'high',
    status,
    requestedBy: USER_ID,
    assignedTo: null,
    dueAt: null,
    response: status === 'answered' ? 'Use issued detail.' : null,
    respondedAt: null,
    respondedBy: null,
    closedAt: null,
    closedBy: null,
    version,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
  }
}

function createForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData()
  form.set('projectId', overrides.projectId ?? PROJECT_ID)
  form.set('clientRequestId', overrides.clientRequestId ?? REQUEST_ID)
  form.set('subject', overrides.subject ?? 'Confirm opening')
  form.set('question', overrides.question ?? 'Please confirm the opening size.')
  form.set('priority', overrides.priority ?? 'high')
  if (overrides.dueAt) form.set('dueAt', overrides.dueAt)
  return form
}

function transitionForm(target: string, overrides: Record<string, string> = {}): FormData {
  const form = new FormData()
  form.set('projectId', overrides.projectId ?? PROJECT_ID)
  form.set('rfiId', overrides.rfiId ?? RFI_ID)
  form.set('target', target)
  form.set('expectedVersion', overrides.expectedVersion ?? '1')
  form.set(
    target === 'answer' ? 'response' : 'reason',
    overrides.response ?? overrides.reason ?? 'Approved by coordination.',
  )
  return form
}

describe('project RFI server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(true)
    mocks.createProjectRfiThroughCoreApi.mockResolvedValue({
      ok: true,
      data: { projectId: PROJECT_ID, created: true, rfi: row() },
    })
    mocks.transitionProjectRfiThroughCoreApi.mockResolvedValue({
      ok: true,
      data: { projectId: PROJECT_ID, changed: true, rfi: row('answered', 2) },
    })
  })

  it('requires a stable client request UUID and sends a PH due-date boundary', async () => {
    await expect(createProjectRfi({ ok: true }, createForm({ dueAt: '2026-09-15' }))).resolves.toEqual({
      ok: true,
      success: 'RFI-0001 created.',
    })
    expect(mocks.createProjectRfiThroughCoreApi).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      subject: 'Confirm opening',
      question: 'Please confirm the opening size.',
      priority: 'high',
      assignedTo: null,
      dueAt: '2026-09-15T23:59:59.000+08:00',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/rfis`)
  })

  it('fails closed for missing idempotency tokens and unauthorized roles', async () => {
    const missingToken = createForm()
    missingToken.delete('clientRequestId')
    await expect(createProjectRfi({ ok: true }, missingToken)).resolves.toEqual({
      ok: false,
      error: 'Invalid project RFI request.',
    })
    mocks.can.mockReturnValue(false)
    await expect(createProjectRfi({ ok: true }, createForm())).resolves.toEqual({
      ok: false,
      error: 'You do not have permission to create project RFIs.',
    })
    expect(mocks.createProjectRfiThroughCoreApi).not.toHaveBeenCalled()
  })

  it('routes transitions through Core and rejects a forged response scope', async () => {
    await expect(
      transitionProjectRfi({ ok: true }, transitionForm('answer', { response: 'Use detail A.' })),
    ).resolves.toEqual({ ok: true, success: 'Response saved.' })
    expect(mocks.transitionProjectRfiThroughCoreApi).toHaveBeenCalledWith(
      PROJECT_ID,
      RFI_ID,
      'answer',
      { expectedVersion: 1, response: 'Use detail A.' },
    )

    mocks.transitionProjectRfiThroughCoreApi.mockResolvedValueOnce({
      ok: true,
      data: {
        projectId: PROJECT_ID,
        changed: true,
        rfi: { ...row('answered', 2), projectId: '66666666-6666-4666-8666-666666666666' },
      },
    })
    await expect(
      transitionProjectRfi({ ok: true }, transitionForm('answer')),
    ).resolves.toEqual({
      ok: false,
      error: 'ERP Core API returned an invalid project RFI scope.',
    })
  })
})
