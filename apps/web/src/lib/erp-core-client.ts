import 'server-only'

import { randomUUID } from 'node:crypto'
import {
  rfqAwardResultSchema,
  type CancelRfqCommand,
  type RfqAwardResult,
  rfqQuoteResultSchema,
  rfqTransitionResultSchema,
  processHealthResultSchema,
  projectUpdateResultSchema,
  type LogRfqQuoteCommand,
  type ProcessHealthResult,
  type ProjectUpdateResult,
  type RfqQuoteResult,
  type RfqTransitionResult,
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

export function rfqTransitionWritesUseCoreApi(
  tenantId: string
): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_RFQ_TRANSITION_WRITES_VIA_API,
    process.env.ERP_RFQ_TRANSITION_WRITES_VIA_API_TENANT_IDS
  )
}

export function rfqAwardWritesUseCoreApi(tenantId: string): boolean {
  return tenantEnabledForCoreApi(
    tenantId,
    process.env.ERP_RFQ_AWARD_WRITES_VIA_API,
    process.env.ERP_RFQ_AWARD_WRITES_VIA_API_TENANT_IDS
  )
}

type RfqTransitionRequest =
  | { command: 'complete' }
  | ({ command: 'cancel' } & CancelRfqCommand)

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
  command: RfqTransitionRequest,
  kind: 'complete' | 'cancel'
): Promise<CoreResult<RfqTransitionResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  const path =
    kind === 'complete'
      ? `/v1/procurement/rfqs/${rfqId}/complete`
      : `/v1/procurement/rfqs/${rfqId}/cancel`

  try {
    const requestBody =
      command.command === 'complete'
        ? {}
        : { reason: command.reason }

    const response = await fetch(`${access.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access.accessToken}`,
        'content-type': 'application/json',
        'x-request-id': randomUUID(),
      },
      body: JSON.stringify(requestBody),
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
            ? 'RFQ cannot be moved to that state.'
            : response.status === 404
              ? 'RFQ was not found.'
              : 'RFQ transition was not committed.'
      return { ok: false, error: message }
    }

    const parsed = rfqTransitionResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid RFQ transition result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No RFQ transition was committed.',
    }
  }
}

export async function awardRfqQuoteThroughCoreApi(
  rfqId: string,
  quoteId: string
): Promise<CoreResult<RfqAwardResult>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(
      `${access.baseUrl}/v1/procurement/rfqs/${rfqId}/quotes/${quoteId}/award`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'content-type': 'application/json',
          'x-request-id': randomUUID(),
        },
        body: '{}',
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
            ? 'RFQ quote cannot be awarded.'
            : response.status === 404
              ? 'RFQ or quote was not found.'
              : 'RFQ award was not committed.'
      return { ok: false, error: message }
    }

    const parsed = rfqAwardResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid RFQ award result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. No RFQ award was committed.',
    }
  }
}

export async function getProcessHealthThroughCoreApi(): Promise<
  CoreResult<ProcessHealthResult>
> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access

  try {
    const response = await fetch(`${access.baseUrl}/v1/process/health`, {
      headers: {
        authorization: `Bearer ${access.accessToken}`,
        'x-request-id': randomUUID(),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          typeof body?.message === 'string'
            ? body.message
            : 'Process health is unavailable.',
      }
    }

    const parsed = processHealthResultSchema.safeParse(body)
    if (!parsed.success) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid process-health result.',
      }
    }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      error: 'ERP Core API is unavailable. Process health was not loaded.',
    }
  }
}
