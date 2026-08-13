'use server'

import { revalidatePath } from 'next/cache'
import { getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { projectComments, users } from '@third-code-erp/database/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'

interface ActionResult {
  error?: string
}

const EMAIL_MENTION_RE = /@([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g

function extractMentionEmails(body: string): string[] {
  const matches = new Set<string>()
  for (const match of body.matchAll(EMAIL_MENTION_RE)) {
    if (match[1]) matches.add(match[1].toLowerCase())
  }
  return Array.from(matches)
}

async function resolveMentionUserIds(
  tenantId: string,
  emails: string[]
): Promise<string[]> {
  if (emails.length === 0) return []
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenant_id, tenantId), inArray(users.email, emails)))
  return rows.map((r) => r.id)
}

export async function createComment(
  projectId: string,
  formData: FormData
): Promise<ActionResult> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  const rawBody = formData.get('body')
  const body = typeof rawBody === 'string' ? rawBody.trim() : ''
  if (!body) return { error: 'Comment body is required' }
  if (body.length > 10000) return { error: 'Comment is too long (max 10,000 characters)' }

  const mentionEmails = extractMentionEmails(body)
  const mentionIds = await resolveMentionUserIds(profile.tenantId, mentionEmails)

  const [inserted] = await db
    .insert(projectComments)
    .values({
      tenant_id: profile.tenantId,
      project_id: projectId,
      author_id: profile.user.id,
      body,
      mentions: mentionIds,
    })
    .returning({ id: projectComments.id })

  if (!inserted) return { error: 'Failed to insert comment' }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'project_comment',
    entityId: inserted.id,
    action: 'create',
    diff: {
      project_id: projectId,
      body_length: body.length,
      mention_count: mentionIds.length,
    },
  })

  revalidatePath(`/projects/${projectId}/comments`)
  return {}
}

export async function deleteComment(
  commentId: string,
  projectId: string
): Promise<ActionResult> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  // Verify the comment belongs to this tenant before deleting.
  const [existing] = await db
    .select({
      id: projectComments.id,
      tenant_id: projectComments.tenant_id,
      project_id: projectComments.project_id,
    })
    .from(projectComments)
    .where(
      and(
        eq(projectComments.id, commentId),
        eq(projectComments.tenant_id, profile.tenantId)
      )
    )

  if (!existing) return { error: 'Comment not found' }
  await db
    .delete(projectComments)
    .where(
      and(
        eq(projectComments.id, commentId),
        eq(projectComments.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'project_comment',
    entityId: commentId,
    action: 'delete',
    diff: { project_id: existing.project_id },
  })

  revalidatePath(`/projects/${projectId}/comments`)
  return {}
}
