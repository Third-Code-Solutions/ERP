import { describe, expect, it } from 'vitest'
import {
  projectCommentListQuerySchema,
  projectCommentListResultSchema,
} from './project-comments'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const COMMENT_ID = '44444444-4444-4444-8444-444444444444'

describe('project comment read contract', () => {
  it('defaults and bounds the server-owned list limit', () => {
    expect(projectCommentListQuerySchema.parse({})).toEqual({ limit: 100 })
    expect(projectCommentListQuerySchema.parse({ limit: '20' })).toEqual({
      limit: 20,
    })
    expect(projectCommentListQuerySchema.safeParse({ limit: 101 }).success).toBe(
      false
    )
    expect(
      projectCommentListQuerySchema.safeParse({ limit: 20, tenantId: TENANT_ID })
        .success
    ).toBe(false)
  })

  it('requires tenant/project scope and ISO timestamps in results', () => {
    const parsed = projectCommentListResultSchema.parse({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      limit: 100,
      hasMore: false,
      items: [
        {
          id: COMMENT_ID,
          tenantId: TENANT_ID,
          projectId: PROJECT_ID,
          authorId: null,
          authorName: null,
          authorEmail: null,
          body: 'A retained project note.',
          mentions: [],
          createdAt: '2026-08-10T10:00:00.000Z',
          updatedAt: '2026-08-10T10:00:00.000Z',
        },
      ],
    })
    expect(parsed.items[0]?.projectId).toBe(PROJECT_ID)
    expect(
      projectCommentListResultSchema.safeParse({
        ...parsed,
        tenantId: 'not-a-tenant',
      }).success
    ).toBe(false)
  })
})
