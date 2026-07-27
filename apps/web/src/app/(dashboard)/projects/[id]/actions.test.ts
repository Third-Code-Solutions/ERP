import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  writeAuditLog: vi.fn(),
  computeDiff: vi.fn(),
  projectWritesUseCoreApi: vi.fn(),
  updateProjectThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUser: mocks.getUser,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
  computeDiff: mocks.computeDiff,
}))

vi.mock('@/lib/erp-core-client', () => ({
  projectWritesUseCoreApi: mocks.projectWritesUseCoreApi,
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
  updated_at: UPDATED_AT,
}

function selectQuery(rows: unknown[]) {
  const where = vi.fn().mockResolvedValue(rows)
  const from = vi.fn().mockReturnValue({ where })
  return { from }
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

describe('Project update migration switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ id: USER_ID })
    mocks.select
      .mockReturnValueOnce(selectQuery([{ tenant_id: TENANT_ID }]))
      .mockReturnValueOnce(selectQuery([EXISTING]))
    mocks.updateWhere.mockResolvedValue(undefined)
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere })
    mocks.update.mockReturnValue({ set: mocks.updateSet })
    mocks.computeDiff.mockReturnValue({ name: ['Existing', 'Updated'] })
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.updateProjectThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        ...EXISTING,
        tenantId: TENANT_ID,
        projectType: 'fit_out',
        totalSqm: 125,
        location: 'Makati',
        notes: 'Controlled update',
        updatedAt: '2026-07-28T01:00:00.000Z',
      },
    })
  })

  it('keeps the legacy write and audit path active when flag is false', async () => {
    mocks.projectWritesUseCoreApi.mockReturnValue(false)

    await expect(
      updateProject(PROJECT_ID, projectForm())
    ).resolves.toEqual({})

    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce()
    expect(mocks.updateProjectThroughCoreApi).not.toHaveBeenCalled()
  })

  it('routes only through Nest when flag is true', async () => {
    mocks.projectWritesUseCoreApi.mockReturnValue(true)

    await expect(
      updateProject(PROJECT_ID, projectForm())
    ).resolves.toEqual({})

    expect(mocks.updateProjectThroughCoreApi).toHaveBeenCalledOnce()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })
})
