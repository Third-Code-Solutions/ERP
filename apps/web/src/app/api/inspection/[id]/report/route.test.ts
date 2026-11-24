import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  select: vi.fn(),
  canViewPath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({ getUserProfile: mocks.getUserProfile }))
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('@/lib/operations/nav-config', () => ({ canViewPath: mocks.canViewPath }))

import { GET } from './route'

const ID = '66666666-6666-4666-8666-666666666666'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

function request() {
  return GET({} as never, { params: Promise.resolve({ id: ID }) })
}

describe('inspection report route gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role: 'sales' })
  })

  it('answers 403 before any query when the dashboard page rule denies the role', async () => {
    mocks.canViewPath.mockReturnValue(false)

    const response = await request()

    expect(response.status).toBe(403)
    expect(mocks.canViewPath).toHaveBeenCalledWith('sales', '/crm/opportunities/[id]/proposal/inspection')
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('reaches the tenant-scoped query when the rule allows the role', async () => {
    mocks.canViewPath.mockReturnValue(true)
    mocks.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    })

    const response = await request()

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Inspection not found' })
    expect(mocks.select).toHaveBeenCalledOnce()
  })
})
