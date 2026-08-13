import 'server-only'

import {
  consumeProviderQuotaViaCoreApi,
  type ProviderQuotaAttempt,
  type ProviderQuotaBucket,
} from './erp-core-client'

export { providerQuotaUsesCoreApi } from './erp-core-client'
export type { ProviderQuotaAttempt, ProviderQuotaBucket }

export async function consumeProviderQuota(
  bucket: ProviderQuotaBucket,
  tenantId: string
): Promise<ProviderQuotaAttempt> {
  return consumeProviderQuotaViaCoreApi(bucket, tenantId)
}

export function providerQuotaBlockedResponse(
  result: Extract<ProviderQuotaAttempt, { ok: false }>,
  headers?: HeadersInit
): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Cache-Control', 'private, no-store, max-age=0')
  responseHeaders.set('Vary', 'Cookie')
  if (result.retryAfterSeconds !== undefined) {
    responseHeaders.set(
      'Retry-After',
      String(Math.max(1, Math.ceil(result.retryAfterSeconds)))
    )
  }
  if (result.limit !== undefined) {
    responseHeaders.set('X-RateLimit-Limit', String(result.limit))
  }
  if (result.scope) {
    responseHeaders.set('X-RateLimit-Scope', result.scope)
  }
  return new Response(result.error, {
    status: result.status,
    headers: responseHeaders,
  })
}
