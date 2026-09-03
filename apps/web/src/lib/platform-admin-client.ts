import 'server-only'

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { cookies } from 'next/headers'
import {
  platformOverviewResultSchema, platformTenantSummarySchema, platformUserSummarySchema,
  platformInvitationSummarySchema, platformPagedResultSchema, platformRoleSummarySchema,
  platformAnalyticsResultSchema, platformAuditSummarySchema, platformDependencyStatusSchema,
  platformSystemHealthResultSchema, platformSupportSessionResultSchema,
  platformOperationalAnalyticsResultSchema,
} from '@third-code-erp/shared-types/platform-administration'
import type {
  CreatePlatformSupportSessionCommand,
  CreatePlatformTenantCommand,
  InvitePlatformUserCommand,
  PlatformAnalyticsResult,
  PlatformOperationalAnalyticsResult,
  PlatformAuditSummary,
  PlatformDependencyStatus,
  PlatformInvitationSummary,
  PlatformOverviewResult,
  PlatformPagedResult,
  PlatformRoleSummary,
  PlatformSystemHealthResult,
  PlatformTenantSummary,
  PlatformUserSummary,
  UpdatePlatformTenantStatusCommand,
  UpdatePlatformTenantCommand,
  UpdatePlatformUserRoleCommand,
  UpdatePlatformUserStatusCommand,
} from '@third-code-erp/shared-types/platform-administration'

import { getCoreApiAccess } from './erp-core-client'

export const PLATFORM_SUPPORT_COOKIE = 'erp-platform-support'

export type PlatformResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number }

async function requestPlatform<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit
): Promise<PlatformResult<T>> {
  const access = await getCoreApiAccess()
  if (!access.ok) return access
  try {
    const supportSession = z.string().uuid().safeParse((await cookies()).get(PLATFORM_SUPPORT_COOKIE)?.value)
    const response = await fetch(`${access.baseUrl}/v1/platform-admin${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${access.accessToken}`,
        ...(supportSession.success ? { 'x-platform-support-session': supportSession.data } : {}),
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(init?.method && init.method !== 'GET'
          ? { 'x-request-id': randomUUID() }
          : {}),
        ...init?.headers,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const parsedError = z.object({ message: z.union([z.string(), z.array(z.string())]).optional() }).safeParse(await response.json().catch(() => null))
      const payload = parsedError.success ? parsedError.data : null
      const message = Array.isArray(payload?.message)
        ? payload.message.join('; ')
        : payload?.message
      return {
        ok: false,
        status: response.status,
        error:
          message ||
          (response.status === 403
            ? 'Platform authority was denied.'
            : 'The platform service could not complete the request.'),
      }
    }
    const parsed = schema.safeParse(await response.json())
    if (!parsed.success) return { ok: false, status: 502, error: 'The platform service returned an invalid response. Refresh the directory and audit log before retrying a change.' }
    return { ok: true, data: parsed.data }
  } catch {
    return {
      ok: false,
      status: 503,
      error: 'The platform service response is unavailable. Refresh the directory and audit log before retrying a change; its outcome may be uncertain.',
    }
  }
}

function queryString(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export function getPlatformOverview(): Promise<PlatformResult<PlatformOverviewResult>> {
  return requestPlatform('', platformOverviewResultSchema)
}

export function getPlatformTenants(
  q?: string,
  status?: string,
  page?: string
): Promise<PlatformResult<PlatformPagedResult<PlatformTenantSummary>>> {
  return requestPlatform(`/tenants${queryString({ q, status, page, limit: 100 })}`, platformPagedResultSchema(platformTenantSummarySchema))
}

export function getPlatformUsers(
  q?: string,
  status?: string,
  page?: string
): Promise<PlatformResult<PlatformPagedResult<PlatformUserSummary>>> {
  return requestPlatform(`/users${queryString({ q, status, page, limit: 100 })}`, platformPagedResultSchema(platformUserSummarySchema))
}

export function getPlatformInvitations(page?: string): Promise<
  PlatformResult<PlatformPagedResult<PlatformInvitationSummary>>
> {
  return requestPlatform(`/invitations${queryString({ page, limit: 100 })}`, platformPagedResultSchema(platformInvitationSummarySchema))
}

export function getPlatformRoles(): Promise<PlatformResult<PlatformRoleSummary[]>> {
  return requestPlatform('/roles', z.array(platformRoleSummarySchema))
}

export function getPlatformAnalytics(): Promise<PlatformResult<PlatformAnalyticsResult>> {
  return requestPlatform('/analytics', platformAnalyticsResultSchema)
}

export function getPlatformOperationalAnalytics(): Promise<PlatformResult<PlatformOperationalAnalyticsResult>> {
  return requestPlatform('/analytics/operations', platformOperationalAnalyticsResultSchema)
}

export function getPlatformAudit(q?: string, status?: string, page?: string): Promise<
  PlatformResult<PlatformPagedResult<PlatformAuditSummary>>
> {
  return requestPlatform(`/audit${queryString({ q, status, page, limit: 100 })}`, platformPagedResultSchema(platformAuditSummarySchema))
}

export function getPlatformIntegrations(): Promise<
  PlatformResult<PlatformDependencyStatus[]>
> {
  return requestPlatform('/integrations', z.array(platformDependencyStatusSchema))
}

export function getPlatformSystemHealth(): Promise<PlatformResult<PlatformSystemHealthResult>> {
  return requestPlatform('/system-health', platformSystemHealthResultSchema)
}

export function createPlatformTenant(command: CreatePlatformTenantCommand) {
  return requestPlatform('/tenants', platformTenantSummarySchema, {
    method: 'POST',
    body: JSON.stringify(command),
  })
}

export function changePlatformTenantStatus(
  tenantId: string,
  command: UpdatePlatformTenantStatusCommand
) {
  return requestPlatform(
    `/tenants/${encodeURIComponent(tenantId)}/status`,
    platformTenantSummarySchema,
    { method: 'PATCH', body: JSON.stringify(command) }
  )
}

export function updatePlatformTenant(tenantId: string, command: UpdatePlatformTenantCommand) {
  return requestPlatform(
    `/tenants/${encodeURIComponent(tenantId)}`,
    platformTenantSummarySchema,
    { method: 'PATCH', body: JSON.stringify(command) }
  )
}

export function invitePlatformUser(command: InvitePlatformUserCommand) {
  return requestPlatform('/invitations', platformInvitationSummarySchema, {
    method: 'POST',
    body: JSON.stringify(command),
  })
}

export function resendPlatformInvitation(invitationId: string) {
  return requestPlatform(
    `/invitations/${encodeURIComponent(invitationId)}/resend`,
    platformInvitationSummarySchema,
    { method: 'POST' }
  )
}

export function revokePlatformInvitation(invitationId: string) {
  return requestPlatform(
    `/invitations/${encodeURIComponent(invitationId)}`,
    platformInvitationSummarySchema,
    { method: 'DELETE' }
  )
}

export function changePlatformUserRole(
  userId: string,
  command: UpdatePlatformUserRoleCommand
) {
  return requestPlatform(
    `/users/${encodeURIComponent(userId)}/role`,
    platformUserSummarySchema,
    { method: 'PATCH', body: JSON.stringify(command) }
  )
}

export function changePlatformUserStatus(
  userId: string,
  command: UpdatePlatformUserStatusCommand
) {
  return requestPlatform(
    `/users/${encodeURIComponent(userId)}/status`,
    platformUserSummarySchema,
    { method: 'PATCH', body: JSON.stringify(command) }
  )
}

export function sendPlatformPasswordReset(userId: string) {
  return requestPlatform(
    `/users/${encodeURIComponent(userId)}/password-reset`,
    z.object({ ok: z.literal(true) }),
    { method: 'POST' }
  )
}

export function startPlatformSupportContext(
  command: CreatePlatformSupportSessionCommand
) {
  return requestPlatform('/support-context', platformSupportSessionResultSchema, {
    method: 'POST',
    body: JSON.stringify(command),
  })
}

export function endPlatformSupportContext(sessionId: string) {
  return requestPlatform(
    `/support-context/${encodeURIComponent(sessionId)}`,
    platformSupportSessionResultSchema,
    { method: 'DELETE' }
  )
}
