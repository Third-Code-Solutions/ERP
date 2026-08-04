'use server'

import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { projects, users } from '@third-code-erp/database/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  createProjectThroughCoreApi,
  projectCreateWritesUseCoreApi,
} from '@/lib/erp-core-client'

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  client: z.string().min(1).max(255),
  location: z.string().max(500).optional(),
  project_type: z.enum(['mep', 'fit_out', 'interior', 'mixed']).optional(),
  total_sqm: z.coerce.number().int().positive().optional(),
  notes: z.string().max(2000).optional(),
  idempotency_key: z.string().min(1).max(256).optional(),
})

export async function createProject(formData: FormData) {
  const profile = await requireUserProfile()
  const user = profile.user

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))

  if (!userRow?.tenant_id) {
    throw new Error('User has no tenant')
  }

  const input = createProjectSchema.parse({
    name: formData.get('name'),
    client: formData.get('client'),
    location: formData.get('location') || undefined,
    project_type: formData.get('project_type') || undefined,
    total_sqm: formData.get('total_sqm') || undefined,
    notes: formData.get('notes') || undefined,
    idempotency_key: formData.get('idempotency_key') || undefined,
  })

  if (projectCreateWritesUseCoreApi(profile.tenantId)) {
    requireCapability(profile, 'project.create')
    const result = await createProjectThroughCoreApi({
      name: input.name,
      client: input.client,
      status: 'lead',
      projectType: input.project_type ?? null,
      totalSqm: input.total_sqm ?? null,
      location: input.location ?? null,
      notes: input.notes ?? null,
    }, input.idempotency_key ?? randomUUID())
    if (!result.ok || !result.data) {
      throw new Error(result.error ?? 'Project was not created')
    }
    redirect(`/projects/${result.data.id}`)
  }

  const [inserted] = await db
    .insert(projects)
    .values({
      tenant_id: userRow.tenant_id,
      created_by: user.id,
      ...input,
    })
    .returning({ id: projects.id })

  redirect(`/projects/${inserted?.id}`)
}
