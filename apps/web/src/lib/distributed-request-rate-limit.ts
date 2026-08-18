import type { RequestRateLimitPolicy } from './request-rate-limit'

const RATE_LIMIT_KEY_PREFIX = 'third-code-erp:edge-rate-limit:v1'
const REQUEST_TIMEOUT_MS = 1_000
const MINIMUM_KEY_SALT_LENGTH = 32

/**
 * The request counter is a fixed window. Redis executes this script atomically
 * so concurrent Edge isolates cannot each admit the same over-limit request.
 */
const INCREMENT_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing and tonumber(existing) >= tonumber(ARGV[2]) then
  return {tonumber(ARGV[2]) + 1, redis.call('PTTL', KEYS[1])}
end
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('PTTL', KEYS[1])}
`

type Environment = Readonly<Record<string, string | undefined>>

export type DistributedRateLimitConfiguration =
  | { mode: 'disabled' }
  | {
      mode: 'invalid'
      reason:
        | 'missing-url'
        | 'invalid-url'
        | 'missing-token'
        | 'missing-key-salt'
    }
  | {
      mode: 'configured'
      endpoint: string
      token: string
      keySalt: string
    }

export type DistributedRateLimitDecision =
  | {
      outcome: 'allowed' | 'limited'
      count: number
      limit: number
      retryAfterSeconds: number
    }
  | {
      outcome: 'unavailable'
      reason:
        | 'key-derivation-failed'
        | 'request-failed'
        | 'timeout'
        | 'invalid-response'
    }

export type DistributedRateLimitFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

function normalizedUpstashEndpoint(value: string | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null

  try {
    const parsed = new URL(raw)
    const hostname = parsed.hostname.toLowerCase()
    if (
      parsed.protocol !== 'https:' ||
      hostname === 'upstash.io' ||
      !hostname.endsWith('.upstash.io') ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      return null
    }
    return parsed.origin
  } catch {
    return null
  }
}

/**
 * Distributed enforcement is opt-in and fails closed when explicitly selected
 * but incomplete. A deployment cannot silently claim global rate limiting
 * while reverting to process-local counters.
 */
export function distributedRateLimitConfiguration(
  environment: Environment = process.env
): DistributedRateLimitConfiguration {
  if (environment.ERP_DISTRIBUTED_RATE_LIMIT_ENABLED !== 'true') {
    return { mode: 'disabled' }
  }

  const rawEndpoint = environment.UPSTASH_REDIS_REST_URL
  if (!rawEndpoint?.trim()) {
    return { mode: 'invalid', reason: 'missing-url' }
  }
  const endpoint = normalizedUpstashEndpoint(rawEndpoint)
  if (!endpoint) {
    return { mode: 'invalid', reason: 'invalid-url' }
  }

  const token = environment.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (!token) {
    return { mode: 'invalid', reason: 'missing-token' }
  }

  const keySalt = environment.ERP_RATE_LIMIT_KEY_SALT?.trim()
  if (!keySalt || keySalt.length < MINIMUM_KEY_SALT_LENGTH) {
    return { mode: 'invalid', reason: 'missing-key-salt' }
  }

  return { mode: 'configured', endpoint, token, keySalt }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  )
}

/**
 * Never place raw IP addresses or authenticated user identifiers in a
 * third-party Redis key. The key remains deterministic only within one
 * deployment because the deployment-owned salt participates in the digest.
 */
export async function distributedRateLimitKey(
  configuration: Extract<
    DistributedRateLimitConfiguration,
    { mode: 'configured' }
  >,
  subjectKey: string,
  policy: RequestRateLimitPolicy
): Promise<string> {
  const payload = new TextEncoder().encode(
    `${configuration.keySalt}:${subjectKey}`
  )
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return `${RATE_LIMIT_KEY_PREFIX}:${policy.bucket}:${bytesToHex(
    new Uint8Array(digest)
  )}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function unavailable(
  reason: Extract<
    DistributedRateLimitDecision,
    { outcome: 'unavailable' }
  >['reason']
): DistributedRateLimitDecision {
  return { outcome: 'unavailable', reason }
}

/**
 * Consume a distributed fixed-window token through the Upstash REST command
 * endpoint. The REST protocol accepts an ordered Redis command array, so no
 * Redis TCP client or Edge-incompatible dependency is required.
 */
export async function consumeDistributedRateLimit(
  configuration: Extract<
    DistributedRateLimitConfiguration,
    { mode: 'configured' }
  >,
  subjectKey: string,
  policy: RequestRateLimitPolicy,
  fetcher: DistributedRateLimitFetcher = fetch
): Promise<DistributedRateLimitDecision> {
  let key: string
  try {
    key = await distributedRateLimitKey(configuration, subjectKey, policy)
  } catch {
    return unavailable('key-derivation-failed')
  }

  const abortController = new AbortController()
  const timeout = setTimeout(
    () => abortController.abort(),
    REQUEST_TIMEOUT_MS
  )

  let response: Response
  try {
    response = await fetcher(configuration.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${configuration.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        'EVAL',
        INCREMENT_SCRIPT,
        1,
        key,
        String(policy.windowMs),
        String(policy.limit),
      ]),
      signal: abortController.signal,
      cache: 'no-store',
      redirect: 'error',
    })
  } catch {
    return unavailable(
      abortController.signal.aborted ? 'timeout' : 'request-failed'
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) return unavailable('request-failed')

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return unavailable('invalid-response')
  }

  if (!isRecord(payload) || !Array.isArray(payload.result)) {
    return unavailable('invalid-response')
  }

  const [rawCount, rawTtlMs] = payload.result
  const count = Number(rawCount)
  const ttlMs = Number(rawTtlMs)
  if (
    payload.result.length !== 2 ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < 0
  ) {
    return unavailable('invalid-response')
  }

  const limited = count > policy.limit
  return {
    outcome: limited ? 'limited' : 'allowed',
    count,
    limit: policy.limit,
    retryAfterSeconds: limited ? Math.max(1, Math.ceil(ttlMs / 1_000)) : 0,
  }
}
