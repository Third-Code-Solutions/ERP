'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { can, getUser } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { projectComments, projects, users } from '@third-code-erp/database/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import {
  createProjectCommentThroughCoreApi,
  projectCommentCreateWritesUseCoreApi,
} from '@/lib/erp-core-client'

interface ActionResult {
  error?: string
}

const CreateCommentSchema = z.object({
  projectId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(256).optional(),
})

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
  const parsed = CreateCommentSchema.safeParse({
    projectId,
    idempotencyKey: formData.get('idempotency_key') ?? undefined,
  })
  if (!parsed.success) return { error: 'Invalid project comment request' }

  const safeProjectId = parsed.data.projectId
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id, role: users.role })
    .from(users)
    .where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }
  if (!can(userRow.role, 'project.update')) return { error: 'Forbidden' }

  const rawBody = formData.get('body')
  const body = typeof rawBody === 'string' ? rawBody.trim() : ''
  if (!body) return { error: 'Comment body is required' }
  if (body.length > 10000) return { error: 'Comment is too long (max 10,000 characters)' }

  if (projectCommentCreateWritesUseCoreApi(userRow.tenant_id)) {
    const coreResult = await createProjectCommentThroughCoreApi(
      { projectId: safeProjectId, body },
      parsed.data.idempotencyKey ?? randomUUID()
    )
    if (!coreResult.ok || !coreResult.data) {
      return {
        error:
          coreResult.error ??
          'Project comment was not created. No compatibility fallback was used.',
      }
    }
    if (
      coreResult.data.tenantId !== userRow.tenant_id ||
      coreResult.data.projectId !== safeProjectId ||
      coreResult.data.authorId !== user.id ||
      coreResult.data.body !== body
    ) {
      return { error: 'ERP Core API returned an invalid project comment scope.' }
    }
    revalidatePath(`/projects/${safeProjectId}/comments`)
    return {}
  }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, safeProjectId),
        eq(projects.tenant_id, userRow.tenant_id)
      )
    )
  if (!project) return { error: 'Project not found' }

  const mentionEmails = extractMentionEmails(body)
  const mentionIds = await resolveMentionUserIds(userRow.tenant_id, mentionEmails)

  const [inserted] = await db
    .insert(projectComments)
    .values({
      tenant_id: userRow.tenant_id,
      project_id: safeProjectId,
      author_id: user.id,
      body,
      mentions: mentionIds,
    })
    .returning({ id: projectComments.id })

  if (!inserted) return { error: 'Failed to insert comment' }

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
    entityType: 'project_comment',
    entityId: inserted.id,
    action: 'create',
    diff: {
      project_id: safeProjectId,
      body_length: body.length,
      mention_count: mentionIds.length,
    },
  })

  revalidatePath(`/projects/${safeProjectId}/comments`)
  return {}
}

export async function deleteComment(
  commentId: string,
  projectId: string
): Promise<ActionResult> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  // Verify the comment belongs to this tenant before deleting.
  const [existing] = await db
    .select({
      id: projectComments.id,
      tenant_id: projectComments.tenant_id,
      project_id: projectComments.project_id,
    })
    .from(projectComments)
    .where(eq(projectComments.id, commentId))

  if (!existing) return { error: 'Comment not found' }
  if (existing.tenant_id !== userRow.tenant_id) return { error: 'Forbidden' }

  await db
    .delete(projectComments)
    .where(
      and(
        eq(projectComments.id, commentId),
        eq(projectComments.tenant_id, userRow.tenant_id)
      )
    )

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
    entityType: 'project_comment',
    entityId: commentId,
    action: 'delete',
    diff: { project_id: existing.project_id },
  })

  revalidatePath(`/projects/${projectId}/comments`)
  return {}
}
