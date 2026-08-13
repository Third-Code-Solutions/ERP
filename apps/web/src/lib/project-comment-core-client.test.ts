import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}))

import {
  createProjectCommentThroughCoreApi,
  deleteProjectCommentThroughCoreApi,
  getProjectCommentsThroughCoreApi,
  projectCommentCreateWritesUseCoreApi,
  projectCommentDeleteWritesUseCoreApi,
  projectCommentReadsUseCoreApi,
} from './erp-core-client'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const COMMENT_ID = '44444444-4444-4444-8444-444444444444'

const RESULT = {
  commentId: COMMENT_ID,
  tenantId: TENANT_ID,
  projectId: PROJECT_ID,
  authorId: USER_ID,
  body: 'Delivery is ready.',
  mentions: [],
  created: true,
}

const DELETE_RESULT = {
  commentId: COMMENT_ID,
  tenantId: TENANT_ID,
  projectId: PROJECT_ID,
  deleted: true,
}

const READ_RESULT = {
  tenantId: TENANT_ID,
  projectId: PROJECT_ID,
  limit: 100,
  hasMore: false,
  items: [
    {
      id: COMMENT_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      authorId: USER_ID,
      authorName: 'Project Manager',
      authorEmail: 'pm@example.test',
      body: 'Delivery is ready.',
      mentions: [],
      createdAt: '2026-08-10T10:00:00.000Z',
      updatedAt: '2026-08-10T10:00:00.000Z',
    },
  ],
}

describe('project comment Core client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'test-access-token' } },
        }),
      },
    })
  })

  it('keeps the write selector closed unless exact enabled tenant values match', () => {
    expect(projectCommentCreateWritesUseCoreApi(TENANT_ID)).toBe(false)
    vi.stubEnv('ERP_PROJECT_COMMENT_CREATE_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_COMMENT_CREATE_WRITES_VIA_API_TENANT_IDS', TENANT_ID)
    expect(projectCommentCreateWritesUseCoreApi(TENANT_ID)).toBe(true)
    expect(projectCommentCreateWritesUseCoreApi('not-a-uuid')).toBe(false)
    vi.stubEnv('ERP_PROJECT_COMMENT_CREATE_WRITES_VIA_API', 'TRUE')
    expect(projectCommentCreateWritesUseCoreApi(TENANT_ID)).toBe(false)
    expect(projectCommentDeleteWritesUseCoreApi(TENANT_ID)).toBe(false)
    vi.stubEnv('ERP_PROJECT_COMMENT_DELETE_WRITES_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_COMMENT_DELETE_WRITES_VIA_API_TENANT_IDS', TENANT_ID)
    expect(projectCommentDeleteWritesUseCoreApi(TENANT_ID)).toBe(true)
    expect(projectCommentDeleteWritesUseCoreApi('not-a-uuid')).toBe(false)
    expect(projectCommentReadsUseCoreApi(TENANT_ID)).toBe(false)
    vi.stubEnv('ERP_PROJECT_COMMENT_READS_VIA_API', 'true')
    vi.stubEnv('ERP_PROJECT_COMMENT_READS_VIA_API_TENANT_IDS', TENANT_ID)
    expect(projectCommentReadsUseCoreApi(TENANT_ID)).toBe(true)
    vi.stubEnv('ERP_PROJECT_COMMENT_READS_VIA_API_TENANT_IDS', '*')
    expect(projectCommentReadsUseCoreApi(TENANT_ID)).toBe(false)
  })

  it('posts the command and validates the Core result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(RESULT), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createProjectCommentThroughCoreApi(
        { projectId: PROJECT_ID, body: RESULT.body },
        'comment-client-1'
      )
    ).resolves.toEqual({ ok: true, data: RESULT, status: 201 })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/projects/${PROJECT_ID}/comments`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ projectId: PROJECT_ID, body: RESULT.body }),
        headers: expect.objectContaining({
          'Idempotency-Key': 'comment-client-1',
        }),
      })
    )
  })

  it('returns bounded conflicts and rejects malformed success payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: 'already used' }), {
            status: 409,
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ commentId: COMMENT_ID }), {
            status: 201,
          })
        )
    )

    await expect(
      createProjectCommentThroughCoreApi(
        { projectId: PROJECT_ID, body: RESULT.body },
        'comment-client-2'
      )
    ).resolves.toMatchObject({ ok: false, status: 409, error: 'already used' })
    await expect(
      createProjectCommentThroughCoreApi(
        { projectId: PROJECT_ID, body: RESULT.body },
        'comment-client-3'
      )
    ).resolves.toMatchObject({
      ok: false,
      status: 201,
      error: 'ERP Core API returned an invalid project comment result.',
    })
  })

  it('deletes through Core and validates the strict result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(DELETE_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      deleteProjectCommentThroughCoreApi(
        PROJECT_ID,
        COMMENT_ID,
        'comment-delete-client-1'
      )
    ).resolves.toEqual({ ok: true, data: DELETE_RESULT, status: 200 })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/projects/${PROJECT_ID}/comments/${COMMENT_ID}`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          'Idempotency-Key': 'comment-delete-client-1',
        }),
      })
    )
  })

  it('reads bounded project discussion through Core and validates scope payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(READ_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getProjectCommentsThroughCoreApi(PROJECT_ID)
    ).resolves.toEqual({ ok: true, data: READ_RESULT, status: 200 })
    expect(fetchMock).toHaveBeenCalledWith(
      `https://erp-api.example.test/v1/projects/${PROJECT_ID}/comments?limit=100`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer test-access-token',
        }),
      })
    )
  })

  it('fails closed for a malformed project discussion response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ tenantId: TENANT_ID }), { status: 200 })
      )
    )

    await expect(
      getProjectCommentsThroughCoreApi(PROJECT_ID, 20)
    ).resolves.toMatchObject({
      ok: false,
      status: 200,
      error: 'ERP Core API returned an invalid project comment list result.',
    })
  })

  it('does not accept malformed deletion payloads or hide Core failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: 'not found' }), { status: 404 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ commentId: COMMENT_ID }), { status: 200 })
        )
    )

    await expect(
      deleteProjectCommentThroughCoreApi(PROJECT_ID, COMMENT_ID, 'delete-404')
    ).resolves.toMatchObject({ ok: false, status: 404, error: 'not found' })
    await expect(
      deleteProjectCommentThroughCoreApi(PROJECT_ID, COMMENT_ID, 'delete-bad')
    ).resolves.toMatchObject({
      ok: false,
      status: 200,
      error: 'ERP Core API returned an invalid project comment deletion result.',
    })
  })
})
