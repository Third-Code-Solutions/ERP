import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  enabled: vi.fn(),
  getJob: vi.fn(),
  canonicalRole: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({ getUserProfile: mocks.getUserProfile }))
vi.mock('@/lib/erp-core-client', () => ({
  cortexSemanticIndexJobsUseCoreApi: mocks.enabled,
  getCortexSemanticIndexJobThroughCoreApi: mocks.getJob,
}))
vi.mock('@/lib/operations/nav-config', () => ({
  canonicalRole: mocks.canonicalRole,
}))

import { GET } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '22222222-2222-4222-8222-222222222222'

function get(jobId = JOB_ID) {
  return GET(
    new NextRequest(`http://localhost/api/cortex/semantic-index-jobs/${jobId}`),
    { params: Promise.resolve({ jobId }) }
  )
}

describe('Cortex semantic index status Web boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role: 'admin' })
    mocks.canonicalRole.mockReturnValue('admin')
    mocks.enabled.mockReturnValue(true)
    mocks.getJob.mockResolvedValue({
      ok: true,
      data: {
        jobId: JOB_ID,
        status: 'succeeded',
        maxNodes: 64,
        backlogAtRequest: 64,
        processedNodes: 64,
        attempts: 1,
        providerCalls: 1,
        failureCode: null,
        createdAt: '2026-08-07T00:00:00.000Z',
        updatedAt: '2026-08-07T00:01:00.000Z',
      },
    })
  })

  it('validates opaque identity before the Core call', async () => {
    const response = await get('not-a-uuid')
    expect(response.status).toBe(400)
    expect(mocks.getJob).not.toHaveBeenCalled()
  })

  it('polls one tenant-selected Core job with private caching', async () => {
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0'
    )
    expect(mocks.getJob).toHaveBeenCalledWith(JOB_ID)
  })
})
