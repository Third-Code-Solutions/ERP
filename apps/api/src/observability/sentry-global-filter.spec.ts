import 'reflect-metadata'

import { BadRequestException, Controller, Get } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { SentryGlobalFilter } from '@sentry/nestjs/setup'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

@Controller('probe')
class ProbeController {
  @Get('crash')
  crash(): never {
    throw new Error('database password leaked in message')
  }

  @Get('rejected')
  rejected(): never {
    throw new BadRequestException('Reason is required')
  }
}

async function responsesWith(useSentryFilter: boolean) {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeController],
    providers: useSentryFilter
      ? [{ provide: APP_FILTER, useClass: SentryGlobalFilter }]
      : [],
  }).compile()
  const app = moduleRef.createNestApplication({ logger: false })
  await app.init()
  try {
    const server = app.getHttpServer()
    const crash = await request(server).get('/probe/crash')
    const rejected = await request(server).get('/probe/rejected')
    const missing = await request(server).get('/probe/missing')
    return [crash, rejected, missing].map(({ status, body }) => ({
      status,
      body,
    }))
  } finally {
    await app.close()
  }
}

describe('SentryGlobalFilter in the Core API', () => {
  it('keeps the default Nest HTTP error responses unchanged', async () => {
    const withoutSentry = await responsesWith(false)
    const filterCatch = vi.spyOn(SentryGlobalFilter.prototype, 'catch')
    const withSentry = await responsesWith(true)

    // The Sentry filter handled all three errors, and still answered as Nest does.
    expect(filterCatch).toHaveBeenCalledTimes(3)

    expect(withSentry).toEqual(withoutSentry)
    expect(withSentry[0]).toEqual({
      status: 500,
      body: { statusCode: 500, message: 'Internal server error' },
    })
    expect(withSentry[1]?.status).toBe(400)
    expect(withSentry[2]?.status).toBe(404)
  })
})
