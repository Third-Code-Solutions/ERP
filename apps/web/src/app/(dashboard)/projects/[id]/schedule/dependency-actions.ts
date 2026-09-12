'use server'

import { can, requireUserProfile } from '@third-code-erp/auth'
import { projectScheduleDependencyQuerySchema, type ProjectScheduleDependencyResult } from '@third-code-erp/shared-types'
import { z } from 'zod'
import { getProjectScheduleDependenciesThroughCoreApi } from '@/lib/erp-core-client'

export type ScheduleDependencyActionResult = { ok: true; data: ProjectScheduleDependencyResult } | { ok: false; error: string }

/** Read only: Core rechecks current membership and tenant/project scope. */
export async function loadProjectScheduleDependencies(projectId: string, query: unknown): Promise<ScheduleDependencyActionResult> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile || !can(profile.role, 'project.schedule.manage')) return { ok: false, error: 'You do not have permission to manage schedules.' }
  const project = z.string().uuid().safeParse(projectId)
  const input = projectScheduleDependencyQuerySchema.safeParse(query)
  if (!project.success || !input.success) return { ok: false, error: 'Invalid schedule dependency filters.' }
  const result = await getProjectScheduleDependenciesThroughCoreApi(project.data, input.data)
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Schedule task choices are unavailable.' }
  return { ok: true, data: result.data }
}
