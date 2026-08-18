import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../config/environment'
import type { ErpPrincipal } from '../auth/current-principal.decorator'

export const PROVIDER_QUOTA_BUCKETS = [
  'provider-chat',
  'provider-embedding',
  'provider-vision',
] as const

export type ProviderQuotaBucket = (typeof PROVIDER_QUOTA_BUCKETS)[number]

export interface ProviderQuotaPolicy {
  bucket: ProviderQuotaBucket
  limit: number
  windowMs: number
}

export interface ProviderQuotaDecision {
  allowed: boolean
  bucket: ProviderQuotaBucket
  count: number
  limit: number
  retryAfterSeconds: number
  scope: 'tenant-user'
}

const WINDOW_MS = 60_000

const POLICIES: Record<ProviderQuotaBucket, ProviderQuotaPolicy> = {
  'provider-chat': {
    bucket: 'provider-chat',
    limit: 20,
    windowMs: WINDOW_MS,
  },
  'provider-embedding': {
    bucket: 'provider-embedding',
    limit: 6,
    windowMs: WINDOW_MS,
  },
  'provider-vision': {
    bucket: 'provider-vision',
    limit: 4,
    windowMs: WINDOW_MS,
  },
}

/**
 * Increment one tenant/user provider bucket atomically in Redis.
 *
 * Redis is transport/accounting only. It never becomes ERP transaction
 * authority, and no business payload is placed in the key or value.
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

export function providerQuotaPolicy(
  bucket: ProviderQuotaBucket
): ProviderQuotaPolicy {
  return POLICIES[bucket]
}

export function providerQuotaKey(
  bucket: ProviderQuotaBucket,
  tenantId: string,
  userId: string
): string {
  const subjectHash = createHash('sha256')
    .update(`${tenantId}:${userId}`)
    .digest('hex')
  return `third-code-erp:provider-quota:v1:${bucket}:${subjectHash}`
}

@Injectable()
export class ProviderQuotaService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async consume(
    bucket: ProviderQuotaBucket,
    principal: Pick<ErpPrincipal, 'tenantId' | 'userId'>
  ): Promise<ProviderQuotaDecision> {
    const policy = providerQuotaPolicy(bucket)
    const key = providerQuotaKey(bucket, principal.tenantId, principal.userId)

    let result: unknown
    try {
      result = await this.redis.eval(
        INCREMENT_SCRIPT,
        1,
        key,
        String(policy.windowMs),
        String(policy.limit)
      )
    } catch {
      throw new ServiceUnavailableException(
        'Provider quota accounting is unavailable'
      )
    }

    const [rawCount, rawTtl] = Array.isArray(result) ? result : []
    const count = Number(rawCount)
    const ttlMs = Number(rawTtl)
    if (
      !Number.isSafeInteger(count) ||
      count < 1 ||
      !Number.isFinite(ttlMs) ||
      ttlMs < 0
    ) {
      throw new ServiceUnavailableException(
        'Provider quota accounting returned an invalid result'
      )
    }

    return {
      allowed: count <= policy.limit,
      bucket: policy.bucket,
      count,
      limit: policy.limit,
      retryAfterSeconds:
        count <= policy.limit ? 0 : Math.max(1, Math.ceil(ttlMs / 1_000)),
      scope: 'tenant-user',
    }
  }
}
