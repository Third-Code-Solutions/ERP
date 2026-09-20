'use server'

import { can, requireUserProfile } from '@third-code-erp/auth'
import { projectDocumentListQuerySchema, type ProjectDocumentListResult } from '@third-code-erp/shared-types'
import { z } from 'zod'
import { getProjectDocumentsThroughCoreApi } from '@/lib/erp-core-client'

export type QualityDocumentListState =
  | { ok: true; data: ProjectDocumentListResult }
  | { ok: false; error: string }

/** Optional project evidence for an authorized rejected-IWR punchlist handoff. */
export async function listQualityProjectDocuments(
  projectId: unknown,
  query: unknown = {},
): Promise<QualityDocumentListState> {
  const project = z.string().uuid().transform(value => value.toLowerCase()).safeParse(projectId)
  const filters = projectDocumentListQuerySchema.safeParse(query)
  if (!project.success || !filters.success) return { ok: false, error: 'Invalid project document filters.' }

  const profile = await requireUserProfile().catch(() => null)
  if (!profile || !can(profile.role, 'punchlist.manage')) {
    return { ok: false, error: 'You do not have permission to select punchlist evidence.' }
  }

  try {
    // Core independently checks current membership and tenant/project ownership.
    const result = await getProjectDocumentsThroughCoreApi(project.data, filters.data)
    if (result.ok && result.data) return { ok: true, data: result.data }
  } catch {
    // Preserve unavailable versus empty; never expose internal session/network errors.
    return { ok: false, error: 'Project documents could not be loaded. Try again.' }
  }
  return { ok: false, error: 'Project documents could not be loaded. Try again.' }
}
