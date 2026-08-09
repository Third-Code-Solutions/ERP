import { describe, expect, it } from 'vitest'
import {
  deleteProjectCommentCommandSchema,
  projectCommentDeletionResultSchema,
} from './project-comments'

const projectId = '00000000-0000-4000-8000-000000000001'
const commentId = '00000000-0000-4000-8000-000000000002'
const tenantId = '00000000-0000-4000-8000-000000000003'

describe('project comment deletion contract', () => {
  it('accepts only the strict tenant/project/comment command', () => {
    expect(
      deleteProjectCommentCommandSchema.parse({ projectId, commentId })
    ).toEqual({ projectId, commentId })
    expect(() =>
      deleteProjectCommentCommandSchema.parse({ projectId, commentId, extra: true })
    ).toThrow()
  })

  it('requires an explicit successful deletion result', () => {
    expect(
      projectCommentDeletionResultSchema.parse({
        commentId,
        tenantId,
        projectId,
        deleted: true,
      })
    ).toMatchObject({ commentId, tenantId, projectId, deleted: true })
    expect(() =>
      projectCommentDeletionResultSchema.parse({
        commentId,
        tenantId,
        projectId,
        deleted: false,
      })
    ).toThrow()
  })
})
