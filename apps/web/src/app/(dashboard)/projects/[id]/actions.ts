'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { projects, users } from '@buildops/database/schema'
import { and, eq } from 'drizzle-orm'
import { writeAuditLog, computeDiff } from '@/lib/audit'

type ProjectStatus = 'lead' | 'active' | 'on_hold' | 'completed' | 'cancelled'
type ProjectType = 'mep' | 'fit_out' | 'interior' | 'mixed'

export async function updateProject(
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  const [existing] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, userRow.tenant_id)))

  if (!existing) return { error: 'Project not found' }

  const name = str(formData.get('name'))
  const client = str(formData.get('client'))
  if (!name) return { error: 'Project name is required' }
  if (!client) return { error: 'Client is required' }

  const status = str(formData.get('status')) as ProjectStatus | undefined
  const project_type = str(formData.get('project_type')) as ProjectType | undefined | null
  const total_sqm = intOpt(formData.get('total_sqm'))
  const location = str(formData.get('location'))
  const notes = str(formData.get('notes'))

  const updates = {
    name,
    client,
    status: status ?? existing.status,
    project_type: project_type ?? null,
    total_sqm: total_sqm ?? null,
    location: location ?? null,
    notes: notes ?? null,
    updated_at: new Date(),
  }

  await db
    .update(projects)
    .set(updates)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, userRow.tenant_id)))

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
    entityType: 'project',
    entityId: projectId,
    action: 'update',
    diff: computeDiff(existing, updates),
  })

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  revalidatePath('/')
  return {}
}

function str(val: FormDataEntryValue | null): string | undefined {
  if (typeof val !== 'string' || !val.trim()) return undefined
  return val.trim()
}

function intOpt(val: FormDataEntryValue | null): number | undefined {
  if (!val) return undefined
  const n = parseInt(String(val), 10)
  return isNaN(n) ? undefined : n
}
