'use server'

import { revalidatePath } from 'next/cache'
import { getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { projects } from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'
import { writeAuditLog, computeDiff } from '@/lib/audit'
import {
  projectWritesUseCoreApi,
  updateProjectThroughCoreApi,
} from '@/lib/erp-core-client'

type ProjectStatus = 'lead' | 'active' | 'on_hold' | 'completed' | 'cancelled'
type ProjectType = 'mep' | 'fit_out' | 'interior' | 'mixed'

export async function updateProject(
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  const [existing] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, profile.tenantId)))

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

  if (projectWritesUseCoreApi(profile.tenantId)) {
    const result = await updateProjectThroughCoreApi(projectId, {
      name,
      client,
      status: updates.status,
      projectType: updates.project_type,
      totalSqm: updates.total_sqm,
      location: updates.location,
      notes: updates.notes,
      expectedUpdatedAt: existing.updated_at.toISOString(),
    })
    if (!result.ok) {
      return { error: result.error ?? 'Project update failed' }
    }
    refreshProject(projectId)
    return {}
  }

  await db
    .update(projects)
    .set(updates)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, profile.tenantId)))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'project',
    entityId: projectId,
    action: 'update',
    diff: computeDiff(existing, updates),
  })

  refreshProject(projectId)
  return {}
}

function refreshProject(projectId: string): void {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  revalidatePath('/')
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
