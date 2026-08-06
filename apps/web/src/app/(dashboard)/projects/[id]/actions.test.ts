import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  getProjectThroughCoreApi: vi.fn(),
  updateProjectThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@/lib/erp-core-client', () => ({
  getProjectThroughCoreApi: mocks.getProjectThroughCoreApi,
  updateProjectThroughCoreApi: mocks.updateProjectThroughCoreApi,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { updateProject } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const UPDATED_AT = new Date('2026-07-28T00:00:00.000Z')
const PROFILE = {
  user: { id: USER_ID },
  tenantId: TENANT_ID,
  role: 'admin',
  email: 'admin@example.test',
  fullName: 'Admin',
}

const EXISTING = {
  id: PROJECT_ID,
  tenant_id: TENANT_ID,
  name: 'Existing Project',
  client: 'Existing Client',
  status: 'active',
  project_type: 'mep',
  total_sqm: 100,
  location: null,
  notes: null,
  updatedAt: UPDATED_AT.toISOString(),
}

function projectForm(): FormData {
  const form = new FormData()
  form.set('name', 'Updated Project')
  form.set('client', 'Updated Client')
  form.set('status', 'active')
  form.set('project_type', 'fit_out')
  form.set('total_sqm', '125')
  form.set('location', 'Makati')
  form.set('notes', 'Controlled update')
  return form
}

describe('Project update Core authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.getProjectThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        id: PROJECT_ID,
        tenantId: TENANT_ID,
        name: EXISTING.name,
        client: EXISTING.client,
        status: EXISTING.status,
        projectType: EXISTING.project_type,
        totalSqm: EXISTING.total_sqm,
        location: EXISTING.location,
        notes: EXISTING.notes,
        createdAt: '2026-07-27T00:00:00.000Z',
        updatedAt: EXISTING.updatedAt,
        accountId: null,
        createdBy: USER_ID,
      },
    })
    mocks.updateProjectThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        id: PROJECT_ID,
        tenantId: TENANT_ID,
        projectType: 'fit_out',
        totalSqm: 125,
        location: 'Makati',
        notes: 'Controlled update',
        updatedAt: '2026-07-28T01:00:00.000Z',
      },
    })
  })

  it('routes Project updates through Core and sends the read concurrency token', async () => {
    await expect(
      updateProject(PROJECT_ID, projectForm())
    ).resolves.toEqual({})

    expect(mocks.getProjectThroughCoreApi).toHaveBeenCalledWith(PROJECT_ID)
    expect(mocks.updateProjectThroughCoreApi).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({
        status: 'active',
        expectedUpdatedAt: UPDATED_AT.toISOString(),
      })
    )
    expect(mocks.requireCapability).toHaveBeenCalledWith(PROFILE, 'project.update')
  })

  it('returns a Core read failure without attempting a write', async () => {
    mocks.getProjectThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'Project not found.',
    })

    await expect(
      updateProject(PROJECT_ID, projectForm())
    ).resolves.toEqual({ error: 'Project not found.' })

    expect(mocks.updateProjectThroughCoreApi).not.toHaveBeenCalled()
  })

  it('fails closed when Core returns a different tenant or Project', async () => {
    mocks.getProjectThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        id: '44444444-4444-4444-8444-444444444444',
        tenantId: '55555555-5555-4555-8555-555555555555',
        name: EXISTING.name,
        client: EXISTING.client,
        status: EXISTING.status,
        projectType: EXISTING.project_type,
        totalSqm: EXISTING.total_sqm,
        location: EXISTING.location,
        notes: EXISTING.notes,
        createdAt: '2026-07-27T00:00:00.000Z',
        updatedAt: EXISTING.updatedAt,
        accountId: null,
        createdBy: USER_ID,
      },
    })

    await expect(
      updateProject(PROJECT_ID, projectForm())
    ).resolves.toEqual({ error: 'Project read returned an invalid tenant scope.' })
    expect(mocks.updateProjectThroughCoreApi).not.toHaveBeenCalled()
  })

  it('returns Core terminal-transition rejection without a direct write', async () => {
    mocks.updateProjectThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'Project status cannot change from completed to active',
    })
    const form = projectForm()
    form.set('status', 'active')

    await expect(updateProject(PROJECT_ID, form)).resolves.toEqual({
      error: 'Project status cannot change from completed to active',
    })
    expect(mocks.updateProjectThroughCoreApi).toHaveBeenCalledOnce()
  })

  it('requires project.update before reading through Core', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden')
    })

    await expect(updateProject(PROJECT_ID, projectForm())).rejects.toThrow(
      'Forbidden'
    )
    expect(mocks.getProjectThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.updateProjectThroughCoreApi).not.toHaveBeenCalled()
  })
})
