import { ServiceUnavailableException } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HealthController } from './health.controller'

function build(options: {
  databasePing?: () => Promise<unknown>
  redisStatus?: string
  redisPing?: () => Promise<unknown>
}) {
  const redis = {
    status: options.redisStatus ?? 'ready',
    ping: vi.fn(options.redisPing ?? (async () => 'PONG')),
  }
  const database = {
    ping: vi.fn(options.databasePing ?? (async () => undefined)),
  }

  return {
    controller: new HealthController(database as never, redis as never),
    redis,
    database,
  }
}

describe('HealthController', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports liveness without touching a dependency', () => {
    const { controller, redis, database } = build({})

    expect(controller.health()).toEqual({ status: 'ok', service: 'abi-ops-api' })
    expect(redis.ping).not.toHaveBeenCalled()
    expect(database.ping).not.toHaveBeenCalled()
  })

  it('reports ready when both dependencies answer', async () => {
    const { controller } = build({})

    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      database: 'ok',
      redis: 'ok',
    })
  })

  it('fails readiness immediately when the Redis client is not connected', async () => {
    // The regression this guards: with `maxRetriesPerRequest: null` a ping on a
    // disconnected client queues forever, so /ready never answers and Railway's
    // health check never gets a verdict.
    const { controller, redis } = build({ redisStatus: 'reconnecting' })
    const startedAt = Date.now()

    const error = await controller.ready().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ServiceUnavailableException)
    expect(
      (error as ServiceUnavailableException).getResponse()
    ).toMatchObject({ status: 'not_ready', database: 'ok', redis: 'error' })
    expect(Date.now() - startedAt).toBeLessThan(500)
    expect(redis.ping).not.toHaveBeenCalled()
  })

  it('bounds a dependency that accepts the call but never settles', async () => {
    vi.useFakeTimers()
    const { controller } = build({
      databasePing: () => new Promise<never>(() => {}),
    })

    const pending = controller.ready()
    const assertion = expect(pending).rejects.toMatchObject({
      response: { status: 'not_ready', database: 'timeout', redis: 'ok' },
    })

    await vi.advanceTimersByTimeAsync(2_500)
    await assertion
  })
})
