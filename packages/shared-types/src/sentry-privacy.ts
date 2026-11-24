// Error events leave ABI OPS for a third-party processor. These helpers keep
// the web and Core API Sentry SDKs on one errors-only, privacy-first contract.
// Structural types keep this package free of the Sentry SDK.

type ScrubbableRequest = {
  url?: string
  query_string?: unknown
  cookies?: unknown
  data?: unknown
  headers?: Record<string, string>
}

type ScrubbableBreadcrumb = {
  data?: Record<string, unknown>
}

export type ScrubbableSentryEvent = {
  request?: ScrubbableRequest
  breadcrumbs?: ScrubbableBreadcrumb[]
  transaction?: string
}

// Drop headers that carry credentials or signatures, plus idempotency keys,
// client IP addresses and the Referer (it can hold a capability link).
const SENSITIVE_HEADER =
  /auth|cookie|token|secret|key|signature|session|forwarded|-ip$|referer/i

// Public capability links carry their bearer token as the path segment after
// the link kind: web /portal/<kind>/<token>, Core API /v1/public/<kind>/<token>.
const CAPABILITY_TOKEN = /(\/(?:portal|public)\/[^/?#]+\/)[^/?#]+/g

const BREADCRUMB_URL_FIELDS = ['url', 'from', 'to'] as const

export function scrubSentryUrl(url: string): string {
  const [path = ''] = url.split(/[?#]/, 1)
  return path.replace(CAPABILITY_TOKEN, '$1[redacted]')
}

function scrubHeaders(
  headers: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !SENSITIVE_HEADER.test(name))
  )
}

function scrubRequest(request: ScrubbableRequest): ScrubbableRequest {
  // Drop cookies, bodies and the query string outright.
  const { cookies: _cookies, data: _data, query_string: _query, ...kept } =
    request
  return {
    ...kept,
    ...(kept.url === undefined ? {} : { url: scrubSentryUrl(kept.url) }),
    ...(kept.headers === undefined
      ? {}
      : { headers: scrubHeaders(kept.headers) }),
  }
}

function scrubBreadcrumb(
  breadcrumb: ScrubbableBreadcrumb
): ScrubbableBreadcrumb {
  const data = breadcrumb.data
  if (!data) return breadcrumb
  const scrubbed = { ...data }
  for (const field of BREADCRUMB_URL_FIELDS) {
    const value = scrubbed[field]
    if (typeof value === 'string') scrubbed[field] = scrubSentryUrl(value)
  }
  return { ...breadcrumb, data: scrubbed }
}

/** `beforeSend`: returns a scrubbed copy; the SDK's event is not mutated. */
export function scrubSentryEvent<T extends ScrubbableSentryEvent>(event: T): T {
  return {
    ...event,
    ...(event.request ? { request: scrubRequest(event.request) } : {}),
    ...(event.breadcrumbs
      ? { breadcrumbs: event.breadcrumbs.map(scrubBreadcrumb) }
      : {}),
    ...(event.transaction
      ? { transaction: scrubSentryUrl(event.transaction) }
      : {}),
  }
}

export type SentryDeployment = {
  dsn?: string
  environment?: string
  release?: string
}

/**
 * Shared `Sentry.init` options: errors only (no tracing, no Session Replay)
 * and nothing collected beyond the error itself. SDK v11 replaced
 * `sendDefaultPii` with `dataCollection`, whose unset default collects
 * everything, so every category is closed explicitly.
 *
 * Returns null without a DSN (local dev, CI, tests): callers then skip
 * `Sentry.init`, so the SDK stays fully inert. Unset environment/release
 * keys are omitted rather than passed as `undefined`, which would override
 * the SDK's own (build-injected) values.
 */
export function sentryErrorsOnlyOptions(deployment: SentryDeployment) {
  const dsn = deployment.dsn?.trim()
  if (!dsn) return null
  const environment = deployment.environment?.trim()
  const release = deployment.release?.trim()
  return {
    dsn,
    ...(environment ? { environment } : {}),
    ...(release ? { release } : {}),
    tracesSampleRate: 0,
    // Never add sentry-trace/baggage headers to outbound requests (Supabase,
    // Core API, AI and e-sign providers): they would change those requests
    // and disclose the release and DSN key to third parties.
    tracePropagationTargets: [],
    dataCollection: {
      userInfo: false,
      cookies: false,
      // Request headers stay (user agent, request id); beforeSend drops the
      // sensitive ones. Response headers can carry Set-Cookie.
      httpHeaders: { request: true, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    beforeSend: scrubSentryEvent,
  }
}
