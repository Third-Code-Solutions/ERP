import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { projectComments, projects, users } from '@third-code-erp/database/schema'
import { and, desc, eq } from 'drizzle-orm'
import { CommentThread, type CommentThreadItem } from '@/components/comments/comment-thread'
import { CommentComposer } from '@/components/comments/comment-composer'
import {
  getProjectCommentsThroughCoreApi,
  projectCommentReadsUseCoreApi,
} from '@/lib/erp-core-client'

export const metadata: Metadata = { title: 'Comments' }

const TABS = [
  { label: 'Overview', href: '' },
  { label: 'Scope', href: '/scope' },
  { label: 'BOM', href: '/bom' },
  { label: 'Documents', href: '/documents' },
  { label: 'Billing', href: '/billing' },
  { label: 'Comments', href: '/comments' },
  { label: 'Audit', href: '/audit' },
]

const MAX_COMMENTS = 100

export default async function ProjectCommentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return notFound()

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, userRow.tenant_id)))

  if (!project) return notFound()

  const comments: CommentThreadItem[] = projectCommentReadsUseCoreApi(
    userRow.tenant_id
  )
    ? await (async () => {
        const result = await getProjectCommentsThroughCoreApi(id, MAX_COMMENTS)
        if (!result.ok || !result.data) {
          throw new Error(result.error ?? 'Project comments were not read')
        }
        if (
          result.data.tenantId !== userRow.tenant_id ||
          result.data.projectId !== id ||
          result.data.items.length > MAX_COMMENTS ||
          result.data.items.some(
            (comment) =>
              comment.tenantId !== userRow.tenant_id ||
              comment.projectId !== id
          )
        ) {
          throw new Error('ERP Core API returned an invalid comment scope')
        }
        return result.data.items.map((comment) => ({
          id: comment.id,
          authorId: comment.authorId,
          authorName:
            comment.authorName ?? comment.authorEmail ?? 'Removed user',
          authorEmail: comment.authorEmail,
          body: comment.body,
          createdAt: new Date(comment.createdAt),
        }))
      })()
    : await (async () => {
        const rows = await db
          .select({
            id: projectComments.id,
            author_id: projectComments.author_id,
            body: projectComments.body,
            created_at: projectComments.created_at,
            author_email: users.email,
            author_full_name: users.full_name,
          })
          .from(projectComments)
          .leftJoin(users, eq(projectComments.author_id, users.id))
          .where(
            and(
              eq(projectComments.project_id, id),
              eq(projectComments.tenant_id, userRow.tenant_id)
            )
          )
          .orderBy(desc(projectComments.created_at))
          .limit(MAX_COMMENTS)

        return rows.map((row) => ({
          id: row.id,
          authorId: row.author_id,
          authorName: row.author_full_name ?? row.author_email ?? 'Removed user',
          authorEmail: row.author_email,
          body: row.body,
          createdAt: row.created_at,
        }))
      })()

  const baseHref = `/projects/${id}`

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Link href="/projects" style={{ color: 'var(--color-neutral-400)', fontSize: '0.875rem', textDecoration: 'none' }}>
          Projects
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <Link href={baseHref} style={{ color: 'var(--color-neutral-400)', fontSize: '0.875rem', textDecoration: 'none' }}>
          {project.name}
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>Comments</span>
      </div>

      {/* Tab nav */}
      <div
        style={{
          display: 'flex',
          gap: '2px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--color-border)',
          marginTop: '16px',
        }}
      >
        {TABS.map(({ label, href }) => {
          const fullHref = baseHref + href
          const isActive = href === '/comments'
          return (
            <Link
              key={label}
              href={fullHref}
              style={{
                padding: '8px 16px',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-navy-700)' : 'var(--color-neutral-500)',
                textDecoration: 'none',
                borderBottom: isActive ? '2px solid var(--color-navy-700)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {/* Header */}
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2
          style={{
            margin: 0,
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--color-neutral-900)',
            letterSpacing: '-0.005em',
          }}
        >
          Comments
        </h2>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)' }}>
          {comments.length === 0
            ? 'No comments yet'
            : `Showing ${comments.length} of last ${MAX_COMMENTS}`}
        </span>
      </div>

      {/* Composer */}
      <div style={{ marginBottom: '20px' }}>
        <CommentComposer projectId={id} />
      </div>

      {/* Thread */}
      <CommentThread projectId={id} currentUserId={user.id} comments={comments} />
    </div>
  )
}
