import {
  Controller,
  Get,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import Redis from 'ioredis'
import { Public } from '../auth/supabase-jwt.guard'
import { REDIS_CLIENT } from '../config/environment'
import { DatabaseService } from '../database/database.service'

/**
 * Readiness probes must settle. Without a bound, a dependency that accepts the
 * TCP connection but never answers leaves this handler pending indefinitely:
 * ioredis is configured with `maxRetriesPerRequest: null`, so commands queue
 * forever while Redis is unreachable. Railway's `healthcheckPath = "/ready"`
 * then never receives a verdict, so the instance is neither marked healthy nor
 * failed and stops serving routed traffic. The web tier sees that as the
 * platform-service timeout behind its fail-closed panels.
 */
const DEPENDENCY_TIMEOUT_MS = 2_000

type DependencyOutcome = 'ok' | 'timeout' | 'error'

type DependencyResult = {
  readonly dependency: string
  readonly outcome: DependencyOutcome
  readonly durationMs: number
  readonly detail?: string
}

async function probeDependency(
  dependency: string,
  probe: () => Promise<unknown>
): Promise<DependencyResult> {
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    await Promise.race([
      probe(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${dependency} probe exceeded ${DEPENDENCY_TIMEOUT_MS}ms without settling`
              )
            ),
          DEPENDENCY_TIMEOUT_MS
        )
      }),
    ])

    return {
      dependency,
      outcome: 'ok',
      durationMs: Date.now() - startedAt,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return {
      dependency,
      outcome: message.includes('without settling') ? 'timeout' : 'error',
      durationMs: Date.now() - startedAt,
      detail: message,
    }
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name)

  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis
  ) {}

  @Public()
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'abi-ops-api',
    }
  }

  /**
   * A disconnected ioredis client does not reject commands — with
   * `maxRetriesPerRequest: null` it queues them until the connection returns,
   * which is forever if it does not. Reading the connection status first turns
   * the common "Redis is down" case into an immediate verdict instead of a
   * probe that only ends when its own timeout fires.
   */
  private async probeRedis(): Promise<DependencyResult> {
    const status = this.redis.status

    // 'wait' is the lazyConnect resting state: the first command opens the
    // connection, so a ping here is meaningful.
    if (status !== 'ready' && status !== 'wait') {
      return {
        dependency: 'redis',
        outcome: 'error',
        durationMs: 0,
        detail: `client not connected (status=${status})`,
      }
    }

    return probeDependency('redis', () => this.redis.ping())
  }

  @Public()
  @Get('ready')
  async ready() {
    const [database, redis] = await Promise.all([
      probeDependency('database', () => this.database.ping()),
      this.probeRedis(),
    ])

    const failures = [database, redis].filter(
      (result) => result.outcome !== 'ok'
    )

    if (failures.length > 0) {
      this.logger.error(
        `Readiness check failed: ${failures
          .map(
            (result) =>
              `${result.dependency}=${result.outcome} (${result.durationMs}ms)` +
              (result.detail ? ` ${result.detail}` : '')
          )
          .join('; ')}`
      )

      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: database.outcome,
        redis: redis.outcome,
      })
    }

    return {
      status: 'ready',
      database: database.outcome,
      redis: redis.outcome,
    }
  }
}
