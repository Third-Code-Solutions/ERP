import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../config/environment'

const redisLogger = new Logger('Redis')

class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'end') return
    await this.redis.quit().catch(() => this.redis.disconnect())
  }
}

const redisProvider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const redis = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    })
    let connectionErrorReported = false
    redis.on('error', (error) => {
      if (connectionErrorReported) return
      connectionErrorReported = true
      redisLogger.warn(`Connection unavailable: ${error.message}`)
    })
    redis.on('ready', () => {
      connectionErrorReported = false
    })
    return redis
  },
}

/** Shared Redis transport for health, queues, locks, and bounded quotas. */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [redisProvider, RedisLifecycle],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
