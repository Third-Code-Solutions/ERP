import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  changeRequestWritesUseCoreApi: vi.fn(),
  createChangeRequestThroughCoreApi: vi.fn(),
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

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { logChangeRequest } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const DESIGN_FILE_ID = '44444444-4444-4444-8444-444444444444'

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
