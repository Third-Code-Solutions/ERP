import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  createProjectThroughCoreApi: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@/lib/erp-core-client', () => ({
  createProjectThroughCoreApi: mocks.createProjectThroughCoreApi,
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

import { createProject } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const PROFILE = {
  user: { id: USER_ID },
  tenantId: TENANT_ID,
  role: 'admin',
  email: 'admin@example.test',
  fullName: 'Admin',
}

const CREATED = {
  id: PROJECT_ID,
  tenantId: TENANT_ID,
  name: 'New Project',
  client: 'New Client',
  status: 'lead',
  projectType: 'fit_out',
  totalSqm: 120,
  location: 'Makati',
  notes: 'Core-created',
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
}

function projectForm(idempotencyKey?: string): FormData {
  const form = new FormData()
  form.set('name', 'New Project')
  form.set('client', 'New Client')
  form.set('project_type', 'fit_out')
  form.set('total_sqm', '120')
  form.set('location', 'Makati')
  form.set('notes', 'Core-created')
  if (idempotencyKey) form.set('idempotency_key', idempotencyKey)
  return form
}

describe('Project creation Core authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.createProjectThroughCoreApi.mockResolvedValue({
      ok: true,
      data: CREATED,
    })
  })

  it('routes Project creation through Core and redirects to the created record', async () => {
    await expect(createProject(projectForm())).rejects.toThrow(
      `REDIRECT:/projects/${PROJECT_ID}`
    )

    expect(mocks.requireCapability).toHaveBeenCalledWith(
      PROFILE,
      'project.create'
    )
    expect(mocks.createProjectThroughCoreApi).toHaveBeenCalledWith(
      {
        name: 'New Project',
        client: 'New Client',
        status: 'lead',
        projectType: 'fit_out',
        totalSqm: 120,
        location: 'Makati',
        notes: 'Core-created',
      },
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      )
    )
  })

  it('preserves a caller-provided idempotency key', async () => {
    await expect(createProject(projectForm('create-project-1'))).rejects.toThrow(
      `REDIRECT:/projects/${PROJECT_ID}`
    )

    expect(mocks.createProjectThroughCoreApi).toHaveBeenCalledWith(
      expect.any(Object),
      'create-project-1'
    )
  })

  it('returns a readable error on a Core creation error without redirecting', async () => {
    mocks.createProjectThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'Project creation is not enabled for this tenant.',
    })

    await expect(createProject(projectForm())).resolves.toEqual({
      error: 'Project creation is not enabled for this tenant.',
    })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('returns a fallback message when Core fails without a message', async () => {
    mocks.createProjectThroughCoreApi.mockResolvedValue({ ok: false })

    await expect(createProject(projectForm())).resolves.toEqual({
      error: 'Project was not created.',
    })
  })

  it('returns an error when Core returns a different tenant', async () => {
    mocks.createProjectThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        ...CREATED,
        tenantId: '44444444-4444-4444-8444-444444444444',
      },
    })

    await expect(createProject(projectForm())).resolves.toEqual({
      error: 'Project creation returned an invalid tenant scope.',
    })
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it.each([
    ['name', 'x'.repeat(256), 'Project name must be at most 255 characters.'],
    ['notes', 'x'.repeat(2001), 'Notes must be at most 2000 characters.'],
    ['client', '', 'Client is required.'],
    ['total_sqm', '0', 'Total area must be a whole number of at least 1.'],
    ['total_sqm', '12.5', 'Total area must be a whole number of at least 1.'],
    ['project_type', 'villa', 'Project type is not valid.'],
  ])(
    'returns a readable error for an invalid %s without contacting Core',
    async (field, value, message) => {
      const form = projectForm()
      form.set(field, value)

      await expect(createProject(form)).resolves.toEqual({ error: message })
      expect(mocks.createProjectThroughCoreApi).not.toHaveBeenCalled()
      expect(mocks.redirect).not.toHaveBeenCalled()
    }
  )

  it('requires project.create before contacting Core', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden')
    })

    await expect(createProject(projectForm())).rejects.toThrow('Forbidden')
    expect(mocks.createProjectThroughCoreApi).not.toHaveBeenCalled()
  })
})
