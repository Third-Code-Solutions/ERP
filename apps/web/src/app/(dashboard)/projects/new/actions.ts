'use server'

import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { projectTypeValues } from '@third-code-erp/shared-types'
import { z } from 'zod'
import { createProjectThroughCoreApi } from '@/lib/erp-core-client'

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  client: z.string().min(1).max(255),
  location: z.string().max(500).optional(),
  project_type: z.enum(projectTypeValues).optional(),
  total_sqm: z.coerce.number().int().positive().optional(),
  notes: z.string().max(2000).optional(),
  idempotency_key: z.string().min(1).max(256).optional(),
})

export interface CreateProjectState {
  error: string
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Project name',
  client: 'Client',
  location: 'Location',
  project_type: 'Project type',
  total_sqm: 'Total area',
  notes: 'Notes',
}

// Next.js masks the message of a thrown server-action error in production,
// so every expected failure is returned as readable text instead.
function describeIssue(issue: z.ZodIssue): string {
  const field = FIELD_LABELS[String(issue.path[0])] ?? 'Project details'
  if (issue.code === 'too_big') {
    return `${field} must be at most ${issue.maximum} characters.`
  }
  if (issue.code === 'too_small' && issue.origin === 'string') {
    return `${field} is required.`
  }
  if (issue.path[0] === 'total_sqm') {
    return 'Total area must be a whole number of at least 1.'
  }
  return `${field} is not valid.`
}

export async function createProject(
  formData: FormData
): Promise<CreateProjectState> {
  const profile = await requireUserProfile()
  requireCapability(profile, 'project.create')

  const parsed = createProjectSchema.safeParse({
    name: formData.get('name'),
    client: formData.get('client'),
    location: formData.get('location') || undefined,
    project_type: formData.get('project_type') || undefined,
    total_sqm: formData.get('total_sqm') || undefined,
    notes: formData.get('notes') || undefined,
    idempotency_key: formData.get('idempotency_key') || undefined,
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      error: issue
        ? describeIssue(issue)
        : 'Check the project details and try again.',
    }
  }
  const input = parsed.data

  const result = await createProjectThroughCoreApi(
    {
      name: input.name,
      client: input.client,
      status: 'lead',
      projectType: input.project_type ?? null,
      totalSqm: input.total_sqm ?? null,
      location: input.location ?? null,
      notes: input.notes ?? null,
    },
    input.idempotency_key ?? randomUUID()
  )
  if (!result.ok || !result.data) {
    return { error: result.error ?? 'Project was not created.' }
  }
  if (result.data.tenantId !== profile.tenantId) {
    return { error: 'Project creation returned an invalid tenant scope.' }
  }
  redirect(`/projects/${result.data.id}`)
}
