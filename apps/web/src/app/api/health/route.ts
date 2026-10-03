import { NextResponse } from 'next/server'

import { deploymentRevision } from '@/lib/deployment-revision'

export const dynamic = 'force-dynamic'

/**
 * Bounded so a wedged Core API cannot hang the web tier's own health check.
 * Keep this small: the caller is a monitoring probe, not a user.
 */
const CORE_API_PROBE_TIMEOUT_MS = 2_000

type DependencyState = 'ok' | 'timeout' | 'unreachable' | 'unhealthy' | 'not_configured'

async function probeCoreApi(): Promise<{
  state: DependencyState
  status?: number
  detail?: string
}> {
  const baseUrl = process.env.ERP_CORE_API_URL?.replace(/\/+$/, '')
  if (!baseUrl) return { state: 'not_configured' }

  try {
    const response = await fetch(`${baseUrl}/ready`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(CORE_API_PROBE_TIMEOUT_MS),
    })
    if (!response.ok) return { state: 'unhealthy', status: response.status }
    return { state: 'ok', status: response.status }
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') return { state: 'timeout' }
    return {
      state: 'unreachable',
      detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }
  }
}

/**
 * `service` and `revision` are release identity, not secrets. The promotion
 * pipeline (`.github/workflows/deploy-production.yml`) asserts
 * `revision == ${GITHUB_SHA:0:12}` against an anonymous probe of this route,
 * and `scripts/verify-production-surface.mjs` asserts
 * `service == 'abi-ops-web'` with `ok == true`. All three stay unconditional:
 * gating them silently breaks the release contract, and the pipeline deploys
 * before it verifies.
 *
 * What is genuinely sensitive is the raw transport error — it carries the
 * internal Core API hostname and driver detail — so `detail` is returned only
 * to a caller holding HEALTH_DETAIL_TOKEN. That token is not provisioned
 * anywhere, so the fail-closed default is "never disclose".
 *
 * Liveness stays HTTP 200 and `ok` stays true so a Core API outage does not
 * get the web tier recycled — the old route was silent about the outage,
 * which is what let uptime monitoring sit green through two incidents. The
 * dependency verdict now rides on `status` and `dependencies.coreApi.state`,
 * and `?deep=1` opts into a strict 503 whose `ok` reflects the real state.
 */
function isDetailAuthorised(request: Request): boolean {
  const expected = process.env.HEALTH_DETAIL_TOKEN?.trim()
  if (!expected) return false

  const authorization = request.headers.get('authorization') ?? ''
  const bearer = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : ''
  const direct = request.headers.get('x-health-token')?.trim() ?? ''

  return bearer === expected || direct === expected
}

export async function GET(request: Request) {
  const coreApi = await probeCoreApi()
  const degraded = coreApi.state !== 'ok'
  const deep = new URL(request.url).searchParams.get('deep') === '1'
  const detailed = isDetailAuthorised(request)

  return NextResponse.json(
    {
      ok: deep ? !degraded : true,
      status: degraded ? 'degraded' : 'ok',
      service: 'abi-ops-web',
      revision: deploymentRevision(),
      timestamp: new Date().toISOString(),
      dependencies: {
        coreApi: detailed
          ? coreApi
          : { state: coreApi.state, status: coreApi.status },
      },
    },
    {
      status: deep && degraded ? 503 : 200,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      },
    }
  )
}
