import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  enabled: vi.fn(),
  create: vi.fn(),
  canonicalRole: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({ getUserProfile: mocks.getUserProfile }))
vi.mock('@/lib/erp-core-client', () => ({
  cortexSemanticIndexJobsUseCoreApi: mocks.enabled,
  createCortexSemanticIndexJobThroughCoreApi: mocks.create,
}))
vi.mock('@/lib/operations/nav-config', () => ({
  canonicalRole: mocks.canonicalRole,
}))

import { POST } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '22222222-2222-4222-8222-222222222222'

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost/api/cortex/semantic-index-jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  )
}

describe('Cortex semantic index Web boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role: 'admin' })
    mocks.canonicalRole.mockReturnValue('admin')
    mocks.enabled.mockReturnValue(true)
    mocks.create.mockResolvedValue({
      ok: true,
      data: {
        jobId: JOB_ID,
        status: 'queued',
        maxNodes: 64,
        backlogAtRequest: 80,
        createdAt: '2026-08-07T00:00:00.000Z',
      },
    })
  })

  it('fails closed before Core when the exact tenant selector is off', async () => {
    mocks.enabled.mockReturnValue(false)
    const response = await post(
      { maxNodes: 64, costConsent: true },
      { 'idempotency-key': 'index-1' }
    )
    expect(response.status).toBe(503)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('rejects authority fields and missing cost consent', async () => {
    const response = await post(
      {
        maxNodes: 64,
        costConsent: true,
        tenantId: '33333333-3333-4333-8333-333333333333',
      },
      { 'idempotency-key': 'index-1' }
    )
    expect(response.status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('delegates one fixed batch and preserves private response headers', async () => {
    const response = await post(
      { maxNodes: 64, costConsent: true },
      { 'idempotency-key': 'index-1' }
    )
    expect(response.status).toBe(202)
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0'
    )
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.create).toHaveBeenCalledWith(
      { maxNodes: 64, costConsent: true },
      'index-1'
    )
  })
})
