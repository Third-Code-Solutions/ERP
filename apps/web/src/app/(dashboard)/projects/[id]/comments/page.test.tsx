import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
}))

vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('not found') }) }))
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))
vi.mock('@third-code-erp/auth', () => ({ getUser: mocks.getUser, can: mocks.can }))
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('@third-code-erp/database/schema', () => ({
  projectComments: { id: {}, author_id: {}, body: {}, created_at: {}, project_id: {}, tenant_id: {} },
  projects: { id: {}, name: {}, tenant_id: {} },
  users: { id: {}, tenant_id: {}, role: {}, email: {}, full_name: {} },
}))
vi.mock('drizzle-orm', () => ({ and: vi.fn(() => ({})), desc: vi.fn(() => ({})), eq: vi.fn(() => ({})) }))
vi.mock('@/components/comments/comment-composer', () => ({
  CommentComposer: () => <span>COMMENT_COMPOSER</span>,
}))
vi.mock('@/components/comments/comment-thread', () => ({
  CommentThread: () => <span>COMMENT_THREAD</span>,
}))
vi.mock('@/lib/erp-core-client', () => ({
  getProjectCommentsThroughCoreApi: vi.fn(),
  projectCommentReadsUseCoreApi: vi.fn(() => false),
}))

import ProjectCommentsPage from './page'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

function whereChain(value: unknown[]) {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => Promise.resolve(value))
  return chain
}

function commentsChain() {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.leftJoin = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.orderBy = vi.fn(() => chain)
  chain.limit = vi.fn(() => Promise.resolve([]))
  return chain
}

describe('project comments page composer gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ id: 'user-1' })
    mocks.select
      .mockReturnValueOnce(whereChain([{ tenant_id: 'tenant-1', role: 'viewer' }]))
      .mockReturnValueOnce(whereChain([{ id: PROJECT_ID, name: 'Demo project' }]))
      .mockReturnValueOnce(commentsChain())
  })

  it('hides the composer and says why for a role that cannot post', async () => {
    mocks.can.mockReturnValue(false)

    const html = renderToStaticMarkup(await ProjectCommentsPage({ params: Promise.resolve({ id: PROJECT_ID }) }))

    expect(mocks.can).toHaveBeenCalledWith('viewer', 'project.update')
    expect(html).not.toContain('COMMENT_COMPOSER')
    expect(html).toContain('Your role cannot post new ones.')
    expect(html).toContain('COMMENT_THREAD')
  })

  it('shows the composer for a role with project.update', async () => {
    mocks.can.mockReturnValue(true)

    const html = renderToStaticMarkup(await ProjectCommentsPage({ params: Promise.resolve({ id: PROJECT_ID }) }))

    expect(html).toContain('COMMENT_COMPOSER')
  })
})
