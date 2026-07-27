import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common'
import Redis from 'ioredis'
import { Public } from '../auth/supabase-jwt.guard'
import { REDIS_CLIENT } from '../config/environment'
import { DatabaseService } from '../database/database.service'

@Controller()
export class HealthController {
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
      service: 'third-code-erp-api',
    }
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      await Promise.all([this.database.ping(), this.redis.ping()])
      return {
        status: 'ready',
        database: 'ok',
        redis: 'ok',
      }
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: 'check_failed',
        redis: 'check_failed',
      })
    }
  }
}
