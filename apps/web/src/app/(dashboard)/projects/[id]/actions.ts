'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import {
  getProjectThroughCoreApi,
  retireProjectThroughCoreApi,
  updateProjectThroughCoreApi,
} from '@/lib/erp-core-client'

type ProjectStatus = 'lead' | 'active' | 'on_hold' | 'completed' | 'cancelled'
type ProjectType = 'mep' | 'fit_out' | 'interior' | 'structural_civil'

export async function updateProject(
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  requireCapability(profile, 'project.update')

  const existing = await getProjectThroughCoreApi(projectId)
  if (!existing.ok || !existing.data) {
    return { error: existing.error ?? 'Project was not read.' }
  }
  if (
    existing.data.id !== projectId ||
    existing.data.tenantId !== profile.tenantId
  ) {
    return { error: 'Project read returned an invalid tenant scope.' }
  }

  const name = str(formData.get('name'))
  const client = str(formData.get('client'))
  if (!name) return { error: 'Project name is required' }
  if (!client) return { error: 'Client is required' }

  const status = str(formData.get('status')) as ProjectStatus | undefined
  const project_type = str(formData.get('project_type')) as ProjectType | undefined | null
  const total_sqm = intOpt(formData.get('total_sqm'))
  const location = str(formData.get('location'))
  const notes = str(formData.get('notes'))

  const result = await updateProjectThroughCoreApi(projectId, {
    name,
    client,
    status: status ?? existing.data.status,
    projectType: project_type ?? null,
    totalSqm: total_sqm ?? null,
    location: location ?? null,
    notes: notes ?? null,
    expectedUpdatedAt: existing.data.updatedAt,
  })
  if (!result.ok) return { error: result.error ?? 'Project update failed' }

  refreshProject(projectId)
  return {}
}

export async function retireProject(
  projectId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  requireCapability(profile, 'project.delete')

  const reason = str(formData.get('reason'))
  if (!reason || reason.length < 3) {
    return { error: 'Provide a deletion reason of at least 3 characters.' }
  }

  const existing = await getProjectThroughCoreApi(projectId)
  if (!existing.ok || !existing.data) {
    return { error: existing.error ?? 'Project was not read.' }
  }
  if (
    existing.data.id !== projectId ||
    existing.data.tenantId !== profile.tenantId
  ) {
    return { error: 'Project read returned an invalid tenant scope.' }
  }

  const confirmation = str(formData.get('confirmation'))
  if (confirmation !== existing.data.name) {
    return { error: 'Type the exact project name to confirm deletion.' }
  }

  const result = await retireProjectThroughCoreApi(
    projectId,
    {
      reason,
      expectedUpdatedAt: existing.data.updatedAt,
    },
    randomUUID(),
  )
  if (!result.ok || !result.data) {
    return { error: result.error ?? 'Project deletion failed.' }
  }
  if (
    result.data.projectId !== projectId ||
    result.data.tenantId !== profile.tenantId ||
    result.data.deleted !== true
  ) {
    return { error: 'Project deletion returned an invalid tenant scope.' }
  }

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
