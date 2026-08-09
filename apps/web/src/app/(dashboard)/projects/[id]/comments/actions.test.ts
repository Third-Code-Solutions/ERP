import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
  projectCommentCreateWritesUseCoreApi: vi.fn(),
  createProjectCommentThroughCoreApi: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@third-code-erp/auth', () => ({
  getUser: mocks.getUser,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('@/lib/erp-core-client', () => ({
  projectCommentCreateWritesUseCoreApi:
    mocks.projectCommentCreateWritesUseCoreApi,
  createProjectCommentThroughCoreApi:
    mocks.createProjectCommentThroughCoreApi,
}))

import { createComment } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const COMMENT_ID = '44444444-4444-4444-8444-444444444444'
const MENTION_ID = '55555555-5555-4555-8555-555555555555'

function form(body = 'Delivery is ready.', idempotencyKey?: string): FormData {
  const result = new FormData()
  result.set('body', body)
  if (idempotencyKey) result.set('idempotency_key', idempotencyKey)
  return result
}

describe('createComment authority and tenant integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ id: USER_ID })
    mocks.can.mockReturnValue(true)
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.where.mockResolvedValue([{ tenant_id: TENANT_ID, role: 'pm' }])
    mocks.projectCommentCreateWritesUseCoreApi.mockReturnValue(false)
    mocks.insert.mockReturnValue({ values: mocks.values })
    mocks.values.mockReturnValue({ returning: mocks.returning })
    mocks.returning.mockResolvedValue([{ id: COMMENT_ID }])
    mocks.writeAuditLog.mockResolvedValue(undefined)
  })

  it('rejects an invalid project id before authentication or database work', async () => {
    const result = await createComment('not-a-uuid', form())

    expect(result).toEqual({ error: 'Invalid project comment request' })
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('rejects a role without project.update', async () => {
    mocks.can.mockReturnValue(false)

    const result = await createComment(PROJECT_ID, form())

    expect(result).toEqual({ error: 'Forbidden' })
    expect(mocks.can).toHaveBeenCalledWith('pm', 'project.update')
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('uses Core authority without falling back when the canary is selected', async () => {
    mocks.projectCommentCreateWritesUseCoreApi.mockReturnValue(true)
    mocks.createProjectCommentThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        commentId: COMMENT_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        authorId: USER_ID,
        body: 'Delivery is ready.',
        mentions: [],
        created: true,
      },
    })

    const result = await createComment(PROJECT_ID, form())

    expect(result).toEqual({})
    expect(mocks.createProjectCommentThroughCoreApi).toHaveBeenCalledWith(
      { projectId: PROJECT_ID, body: 'Delivery is ready.' },
      expect.stringMatching(/^[0-9a-f-]{36}$/i)
    )
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/comments`
    )
  })

  it('fails closed when Core is unavailable and does not use the legacy insert', async () => {
    mocks.projectCommentCreateWritesUseCoreApi.mockReturnValue(true)
    mocks.createProjectCommentThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'ERP Core API is unavailable. No project comment was created.',
    })

    const result = await createComment(PROJECT_ID, form())

    expect(result).toEqual({
      error: 'ERP Core API is unavailable. No project comment was created.',
    })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('rejects a Core result outside the authenticated tenant/project scope', async () => {
    mocks.projectCommentCreateWritesUseCoreApi.mockReturnValue(true)
    mocks.createProjectCommentThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        commentId: COMMENT_ID,
        tenantId: '66666666-6666-4666-8666-666666666666',
        projectId: PROJECT_ID,
        authorId: USER_ID,
        body: 'Delivery is ready.',
        mentions: [],
        created: true,
      },
    })

    const result = await createComment(PROJECT_ID, form())

    expect(result).toEqual({
      error: 'ERP Core API returned an invalid project comment scope.',
    })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('keeps the compatibility path tenant-scoped and audits mention resolution', async () => {
    mocks.where
      .mockResolvedValueOnce([{ tenant_id: TENANT_ID, role: 'pm' }])
      .mockResolvedValueOnce([{ id: PROJECT_ID }])
      .mockResolvedValueOnce([{ id: MENTION_ID }])

    const result = await createComment(
      PROJECT_ID,
      form('  Ready for @pm@example.test.  ', 'legacy-comment-1')
    )

    expect(result).toEqual({})
    expect(mocks.values).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      project_id: PROJECT_ID,
      author_id: USER_ID,
      body: 'Ready for @pm@example.test.',
      mentions: [MENTION_ID],
    })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        entityType: 'project_comment',
        entityId: COMMENT_ID,
        action: 'create',
        diff: expect.objectContaining({
          project_id: PROJECT_ID,
          mention_count: 1,
        }),
      })
    )
  })
})
