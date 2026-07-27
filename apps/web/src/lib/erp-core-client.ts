import 'server-only'

import { randomUUID } from 'node:crypto'
import {
  projectUpdateResultSchema,
  type ProjectUpdateResult,
  type UpdateProjectCommand,
} from '@third-code-erp/shared-types'
import { createSupabaseServerClient } from '@third-code-erp/auth'

interface CoreResult<T> {
  ok: boolean
  data?: T
  error?: string
}

export function projectWritesUseCoreApi(): boolean {
  return process.env.ERP_PROJECT_WRITES_VIA_API === 'true'
}

export async function updateProjectThroughCoreApi(
  projectId: string,
  command: UpdateProjectCommand
): Promise<CoreResult<ProjectUpdateResult>> {
  const baseUrl = process.env.ERP_CORE_API_URL?.replace(/\/+$/, '')
  if (!baseUrl) {
    return {
      ok: false,
      error: 'ERP Core API is not configured.',
    }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { ok: false, error: 'Unauthorized' }
  }

  try {
    const response = await fetch(`${baseUrl}/v1/projects/${projectId}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'content-type': 'application/json',
        'x-request-id': randomUUID(),
      },
      body: JSON.stringify(command),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'Project changed after this form was opened.'
            : 'Project update was not committed.'
      return { ok: false, error: message }
    }

    const parsed = projectUpdateResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid Project result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No Project change was committed.',
    }
  }
}
