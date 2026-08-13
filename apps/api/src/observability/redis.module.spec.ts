import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { REDIS_CLIENT } from '../config/environment'
import { ProviderQuotaService } from './provider-quota.service'
import { ProviderQuotaModule } from './provider-quota.module'
import { RedisModule } from './redis.module'

describe('RedisModule wiring', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('exports the shared Redis token to quota consumers', async () => {
    const redis = {
      status: 'end',
    }
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        RedisModule,
        ProviderQuotaModule,
      ],
    })
      .overrideProvider(REDIS_CLIENT)
      .useValue(redis)
      .compile()

    expect(moduleRef.get(ProviderQuotaService)).toBeInstanceOf(
      ProviderQuotaService
    )
    expect(moduleRef.get(REDIS_CLIENT)).toBe(redis)
    await moduleRef.close()
  })
})
