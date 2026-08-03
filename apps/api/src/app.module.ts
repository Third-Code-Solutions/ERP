import {
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import Redis from 'ioredis'
import {
  REDIS_CLIENT,
  redisConnectionOptions,
  validateEnvironment,
} from './config/environment'
import { AuthModule } from './auth/auth.module'
import { CapabilityGuard } from './auth/capability.guard'
import { SupabaseJwtGuard } from './auth/supabase-jwt.guard'
import { DatabaseModule } from './database/database.module'
import { HealthController } from './health/health.controller'
import { ProjectsModule } from './projects/projects.module'
import { ProcurementModule } from './procurement/procurement.module'
import { InventoryModule } from './inventory/inventory.module'
import { CadModule } from './cad/cad.module'
import { CrmModule } from './crm/crm.module'
import { FinanceModule } from './finance/finance.module'
import { DocumentsModule } from './documents/documents.module'

const redisLogger = new Logger('Redis')

class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'end') return
    await this.redis.quit().catch(() => this.redis.disconnect())
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnectionOptions(
          config.getOrThrow<string>('REDIS_URL')
        ),
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      }),
    }),
    DatabaseModule,
    AuthModule,
    ProjectsModule,
    ProcurementModule,
    InventoryModule,
    CadModule,
    CrmModule,
    FinanceModule,
    DocumentsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = new Redis(
          config.getOrThrow<string>('REDIS_URL'),
          {
            lazyConnect: true,
            maxRetriesPerRequest: null,
          }
        )
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
    },
    RedisLifecycle,
    {
      provide: APP_GUARD,
      useClass: SupabaseJwtGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CapabilityGuard,
    },
  ],
})
export class AppModule {}
