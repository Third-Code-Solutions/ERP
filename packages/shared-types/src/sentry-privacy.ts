// Error events leave ABI OPS for a third-party processor. These helpers keep
// the web and Core API Sentry SDKs on one errors-only, privacy-first contract.
// Structural types keep this package free of the Sentry SDK.

type ScrubbableRequest = {
  method?: string
  url?: string
  query_string?: unknown
  cookies?: unknown
  data?: unknown
  env?: unknown
  headers?: Record<string, string>
}

type ScrubbableBreadcrumb = {
  category?: string
  message?: string
  data?: Record<string, unknown>
}

export type ScrubbableSentryEvent = {
  request?: ScrubbableRequest
  breadcrumbs?: ScrubbableBreadcrumb[]
  transaction?: string
  sdkProcessingMetadata?: unknown
}

// Allowlist: every other request header is dropped. Routing headers such as
// next-router-state-tree and next-url carry capability tokens, and Vercel adds
// x-vercel-ip-* geolocation headers to every request.
const SAFE_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'user-agent',
  'x-request-id',
]

// Public capability links carry their bearer token as the path segment after
// the link kind: web /portal/<kind>/<token>, Core API /v1/public/<kind>/<token>.
// Separators may be percent-encoded (%2F) when the path sits inside another
// URL. Route patterns such as /portal/sign/[token] are kept.
const CAPABILITY_TOKEN =
  /((?:\/|%2F)(?:portal|public)(?:\/|%2F)[^/?#\s"'<>%]+(?:\/|%2F))(?!\[|%5B)(?:[^/?#\s"'<>%]|%(?!2F|3F|23)[0-9A-F]{2})+/gi

// Query string and fragment of an absolute URL inside free text.
const URL_QUERY_IN_TEXT = /\b((?:https?|app):\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/gi

// Supabase auth parameters (invite, recovery and OAuth redirects) wherever
// they appear, including relative URLs with a #fragment.
const AUTH_PARAM =
  /\b(access_token|refresh_token|provider_token|provider_refresh_token|id_token|token_hash|code)=[^&\s"'<>#]+/gi

// Drizzle reports a failed query as "Failed query: <sql>\nparams: <values>".
// The SQL text holds placeholders only; the values are tenant data.
const QUERY_PARAMS = /(^|\s)params: [\s\S]*/

// Fields whose value is a URL: query string and fragment are dropped too.
// A browser error without a stack reports the page URL as its frame file.
const URL_FIELDS = new Set([
  'url',
  'from',
  'to',
  'request_path',
  'filename',
  'abs_path',
])

export function scrubSentryUrl(url: string): string {
  const [path = ''] = url.split(/[?#]/, 1)
  return redactText(path)
}

function redactText(text: string): string {
  return text
    .replace(URL_QUERY_IN_TEXT, '$1')
    .replace(AUTH_PARAM, '$1=[redacted]')
    .replace(CAPABILITY_TOKEN, '$1[redacted]')
    .replace(QUERY_PARAMS, '$1params: [redacted]')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

// Redacts every string in the (already normalised, JSON-shaped) event,
// stack frames included.
function redactDeep(value: unknown, field?: string): unknown {
  if (typeof value === 'string') {
    return field !== undefined && URL_FIELDS.has(field)
      ? scrubSentryUrl(value)
      : redactText(value)
  }
  if (Array.isArray(value)) return value.map((item) => redactDeep(item))
  if (!isPlainObject(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redactDeep(item, key)])
  )
}

function scrubHeaders(
  headers: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) =>
      SAFE_REQUEST_HEADERS.includes(name.toLowerCase())
    )
  )
}

// Keeps only method, url and allowlisted headers: cookies, bodies, query
// strings and server env are dropped.
function scrubRequest(request: ScrubbableRequest): ScrubbableRequest {
  return {
    ...(request.method === undefined ? {} : { method: request.method }),
    ...(request.url === undefined ? {} : { url: request.url }),
    ...(request.headers === undefined
      ? {}
      : { headers: scrubHeaders(request.headers) }),
  }
}

function isConsoleBreadcrumb(breadcrumb: { category?: string }): boolean {
  return breadcrumb.category === 'console'
}

/** `beforeSend`: returns a scrubbed copy; the SDK's event is not mutated. */
export function scrubSentryEvent<T extends ScrubbableSentryEvent>(event: T): T {
  // SDK-internal state (scopes, raw request), never serialised: left as is.
  const { sdkProcessingMetadata, ...data } = event
  const scrubbed = redactDeep({
    ...data,
    ...(event.request ? { request: scrubRequest(event.request) } : {}),
    ...(event.breadcrumbs
      ? {
          breadcrumbs: event.breadcrumbs.filter(
            (breadcrumb) => !isConsoleBreadcrumb(breadcrumb)
          ),
        }
      : {}),
  }) as T
  return sdkProcessingMetadata === undefined
    ? scrubbed
    : { ...scrubbed, sdkProcessingMetadata }
}

/**
 * `beforeBreadcrumb`: console breadcrumbs are never recorded. The app logs
 * caught errors with console.error, and those carry query parameters.
 */
export function dropConsoleBreadcrumb<T extends { category?: string }>(
  breadcrumb: T
): T | null {
  return isConsoleBreadcrumb(breadcrumb) ? null : breadcrumb
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
      // beforeSend applies the same allowlist exactly; the SDK matches
      // substrings. Response headers can carry Set-Cookie.
      httpHeaders: {
        request: { allow: SAFE_REQUEST_HEADERS },
        response: false,
      },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    beforeBreadcrumb: dropConsoleBreadcrumb,
    beforeSend: scrubSentryEvent,
  }
}
