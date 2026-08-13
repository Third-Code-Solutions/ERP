import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  enabled: vi.fn(),
  getResult: vi.fn(),
  cancel: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({ getUserProfile: mocks.getUserProfile }))
vi.mock('@/lib/erp-core-client', () => ({
  cortexAssistantGenerationJobsUseCoreApi: mocks.enabled,
  getCortexAssistantGenerationResultThroughCoreApi: mocks.getResult,
  cancelCortexAssistantGenerationJobThroughCoreApi: mocks.cancel,
}))

import { DELETE, GET } from './route'
import {
  CORTEX_CITATIONS_HEADER,
  decodeCortexCitationHeader,
} from '@/lib/cortex/citation-header'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '22222222-2222-4222-8222-222222222222'
const REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444'
const USER_MESSAGE_ID = '55555555-5555-4555-8555-555555555555'
const MESSAGE_ID = '66666666-6666-4666-8666-666666666666'
const NODE_ID = '77777777-7777-4777-8777-777777777777'
const REF_ID = '88888888-8888-4888-8888-888888888888'

const queuedJob = {
  jobId: JOB_ID,
  requestId: REQUEST_ID,
  status: 'queued' as const,
  attemptCount: 0,
  failureCode: null,
  retryable: false,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
}

function request(method: 'GET' | 'DELETE' = 'GET', jobId = JOB_ID) {
  const nextRequest = new NextRequest(
    `http://localhost/api/cortex/chat/jobs/${jobId}`,
    { method }
  )
  const context = { params: Promise.resolve({ jobId }) }
  return method === 'GET'
    ? GET(nextRequest, context)
    : DELETE(nextRequest, context)
}

describe('Cortex generation result Web boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID })
    mocks.enabled.mockReturnValue(true)
    mocks.getResult.mockResolvedValue({
      ok: true,
      data: { job: queuedJob, result: null },
      status: 200,
    })
    mocks.cancel.mockResolvedValue({
      ok: true,
      data: {
        ...queuedJob,
        status: 'cancelled',
        failureCode: 'cancelled_by_user',
      },
      status: 200,
    })
  })

  it('rejects invalid identity before Core access', async () => {
    const response = await request('GET', 'not-a-uuid')
    expect(response.status).toBe(400)
    expect(mocks.getResult).not.toHaveBeenCalled()
  })

  it('requires a current authenticated profile before Core access', async () => {
    mocks.getUserProfile.mockResolvedValue(null)
    const response = await request()
    expect(response.status).toBe(401)
    expect(mocks.getResult).not.toHaveBeenCalled()
  })

  it('returns a short private retry response while work is pending', async () => {
    const response = await request()
    expect(response.status).toBe(202)
    expect(response.headers.get('retry-after')).toBe('1')
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0'
    )
    expect(mocks.getResult).toHaveBeenCalledWith(JOB_ID)
  })

  it('returns only the current-authority result and citations', async () => {
    const citation = {
      nodeId: NODE_ID,
      nodeType: 'project',
      refTable: 'projects',
      refId: REF_ID,
      title: 'Metro MEP Retrofit',
      projectId: REF_ID,
    }
    mocks.getResult.mockResolvedValue({
      ok: true,
      data: {
        job: { ...queuedJob, status: 'succeeded', attemptCount: 1 },
        result: {
          status: 'succeeded',
          conversationId: CONVERSATION_ID,
          userMessageId: USER_MESSAGE_ID,
          messageId: MESSAGE_ID,
          content: 'Worker grounded answer',
          citations: [citation],
          outcome: 'deterministic_grounded',
          model: 'deterministic-grounded-v1',
        },
      },
      status: 200,
    })
    const response = await request()
    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('Worker grounded answer')
    expect(response.headers.get('X-Conversation-Id')).toBe(CONVERSATION_ID)
    expect(
      decodeCortexCitationHeader(response.headers.get(CORTEX_CITATIONS_HEADER))
    ).toEqual([citation])
  })

  it('cancels through Core with stable job-scoped idempotency', async () => {
    const response = await request('DELETE')
    expect(response.status).toBe(200)
    expect(mocks.cancel).toHaveBeenCalledWith(
      JOB_ID,
      `browser-cancel:${JOB_ID}`
    )
  })
})
