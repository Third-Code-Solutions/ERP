import { Module } from '@nestjs/common'
import { ProviderQuotaController } from './provider-quota.controller'
import { ProviderQuotaService } from './provider-quota.service'
import { RedisModule } from './redis.module'

@Module({
  imports: [RedisModule],
  controllers: [ProviderQuotaController],
  providers: [ProviderQuotaService],
  exports: [ProviderQuotaService],
})
export class ProviderQuotaModule {}
