import { describe, expect, it } from 'vitest'
import {
  createProjectCommentCommandSchema,
  projectCommentCreationResultSchema,
} from './project-comments'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const AUTHOR_ID = '11111111-1111-4111-8111-111111111111'
const COMMENT_ID = '44444444-4444-4444-8444-444444444444'

describe('Project comment ERP API contract', () => {
  it('trims and bounds the server-authorized command', () => {
    expect(
      createProjectCommentCommandSchema.parse({
        projectId: PROJECT_ID,
        body: '  Delivery is ready.  ',
      })
    ).toEqual({ projectId: PROJECT_ID, body: 'Delivery is ready.' })
  })

  it('rejects browser-owned authority fields and empty bodies', () => {
    expect(
      createProjectCommentCommandSchema.safeParse({
        projectId: PROJECT_ID,
        body: 'Comment',
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
    expect(
      createProjectCommentCommandSchema.safeParse({
        projectId: PROJECT_ID,
        body: '   ',
      }).success
    ).toBe(false)
  })

  it('validates a tenant-scoped creation result', () => {
    expect(
      projectCommentCreationResultSchema.parse({
        commentId: COMMENT_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        authorId: AUTHOR_ID,
        body: 'Delivery is ready.',
        mentions: [AUTHOR_ID],
        created: true,
      })
    ).toMatchObject({ projectId: PROJECT_ID, created: true })
  })
})
