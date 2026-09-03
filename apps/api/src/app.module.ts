import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import {
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
import { AuditModule } from './audit/audit.module'
import { ProviderQuotaModule } from './observability/provider-quota.module'
import { RedisModule } from './observability/redis.module'
import { AssetsModule } from './assets/assets.module'
import { CortexModule } from './cortex/cortex.module'
import { AdminModule } from './admin/admin.module'
import { SearchModule } from './search/search.module'
import { NotificationsModule } from './notifications/notifications.module'
import { TodayModule } from './today/today.module'
import { DailyTasksModule } from './daily-tasks/daily-tasks.module'
import { PlatformAdministrationModule } from './platform-admin/platform-administration.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    RedisModule,
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
    AuditModule,
    ProviderQuotaModule,
    AssetsModule,
    CortexModule,
    SearchModule,
    AdminModule,
    NotificationsModule,
    TodayModule,
    DailyTasksModule,
    PlatformAdministrationModule,
  ],
  controllers: [HealthController],
  providers: [
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
