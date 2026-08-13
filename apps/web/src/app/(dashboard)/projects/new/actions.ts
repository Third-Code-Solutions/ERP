'use server'

import { redirect } from 'next/navigation'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { projects } from '@third-code-erp/database/schema'
import { z } from 'zod'

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  client: z.string().min(1).max(255),
  location: z.string().max(500).optional(),
  project_type: z.enum(['mep', 'fit_out', 'interior', 'mixed']).optional(),
  total_sqm: z.coerce.number().int().positive().optional(),
  notes: z.string().max(2000).optional(),
})

export async function createProject(formData: FormData) {
  const profile = await requireUserProfile()

  const input = createProjectSchema.parse({
    name: formData.get('name'),
    client: formData.get('client'),
    location: formData.get('location') || undefined,
    project_type: formData.get('project_type') || undefined,
    total_sqm: formData.get('total_sqm') || undefined,
    notes: formData.get('notes') || undefined,
  })

  const [inserted] = await db
    .insert(projects)
    .values({
      tenant_id: profile.tenantId,
      created_by: profile.user.id,
      ...input,
    })
    .returning({ id: projects.id })

  redirect(`/projects/${inserted?.id}`)
}
