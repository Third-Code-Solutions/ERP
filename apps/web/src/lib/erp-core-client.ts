import 'server-only'

import { randomUUID } from 'node:crypto'
import {
  rfqCreationResultSchema,
  projectUpdateResultSchema,
  rfqQuoteResultSchema,
  rfqTransitionResultSchema,
  type CreateRfqCommand,
  type LogRfqQuoteCommand,
  type ProjectUpdateResult,
  type RfqCreationResult,
  type RfqQuoteResult,
  type RfqTransitionResult,
  type TransitionRfqCommand,
  type UpdateProjectCommand,
} from '@third-code-erp/shared-types'
import { createSupabaseServerClient } from '@third-code-erp/auth'

interface CoreResult<T> {
  ok: boolean
  data?: T
  error?: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function tenantEnabledForCoreApi(
  tenantId: string,
  enabled: string | undefined,
  tenantIds: string | undefined
): boolean {
  if (enabled !== 'true') return false
  const normalizedTenantId = tenantId.trim().toLowerCase()
  if (!UUID_PATTERN.test(normalizedTenantId)) return false

  const allowlist = (tenantIds ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  if (allowlist.length === 0) return false
  if (
    allowlist.some(
      (entry) => entry !== '*' && !UUID_PATTERN.test(entry)
    )
  ) {
    return false
  }
  if (allowlist.includes('*')) return allowlist.length === 1

  return allowlist.includes(normalizedTenantId)
}

export function projectWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_PROJECT_WRITES_VIA_API,
    process.env.ERP_PROJECT_WRITES_VIA_API_TENANT_IDS
  )
}

export function rfqQuoteWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_RFQ_QUOTE_WRITES_VIA_API,
    process.env.ERP_RFQ_QUOTE_WRITES_VIA_API_TENANT_IDS
  )
}

export function rfqCreateWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_RFQ_CREATE_WRITES_VIA_API,
    process.env.ERP_RFQ_CREATE_WRITES_VIA_API_TENANT_IDS
  )
}

export function rfqTerminalWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_RFQ_TERMINAL_WRITES_VIA_API,
    process.env.ERP_RFQ_TERMINAL_WRITES_VIA_API_TENANT_IDS
  )
}

async function getCoreApiAccess(): Promise<
  | { ok: true; baseUrl: string; accessToken: string }
  | { ok: false; error: string }
> {
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

  return {
    ok: true,
    baseUrl,
    accessToken: session.access_token,
  }
}

export async function updateProjectThroughCoreApi(
  projectId: string,
  command: UpdateProjectCommand
): Promise<CoreResult<ProjectUpdateResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/projects/${projectId}`,
      {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

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

export async function createRfqThroughCoreApi(
  command: CreateRfqCommand
): Promise<CoreResult<RfqCreationResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/rfqs`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'RFQ creation conflicts with the BOM state.'
            : response.status === 404
              ? 'BOM was not found.'
              : 'RFQ was not created.'
      return { ok: false, error: message }
    }

    const parsed = rfqCreationResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid RFQ creation result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No RFQ was created.',
    }
  }
}

export async function logRfqQuoteThroughCoreApi(
  rfqId: string,
  command: LogRfqQuoteCommand
): Promise<CoreResult<RfqQuoteResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/rfqs/${rfqId}/quotes`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'Quote submission conflicts with an existing record.'
            : response.status === 404
              ? 'RFQ, line, or vendor was not found.'
              : 'Quote was not committed.'
      return { ok: false, error: message }
    }

    const parsed = rfqQuoteResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid RFQ quote result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No quote was committed.',
    }
  }
}

export async function transitionRfqThroughCoreApi(
  rfqId: string,
  command: TransitionRfqCommand
): Promise<CoreResult<RfqTransitionResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/rfqs/${rfqId}/transitions`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify(command),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      const message =
        typeof body?.message === 'string'
          ? body.message
          : response.status === 409
            ? 'RFQ transition conflicts with its current state.'
            : response.status === 404
              ? 'RFQ was not found.'
              : 'RFQ transition was not committed.'
      return { ok: false, error: message }
    }

    const parsed = rfqTransitionResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error:
          'ERP Core API returned an invalid RFQ transition result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error:
        'ERP Core API is unavailable. No RFQ transition was committed.',
    }
  }
}
