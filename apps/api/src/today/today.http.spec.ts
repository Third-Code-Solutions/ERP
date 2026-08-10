import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { TodayController } from './today.controller'
import { TodayPipe } from './today.pipe'
import { TodayService } from './today.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Today HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(read = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [TodayController],
      providers: [
        TodayPipe,
        { provide: TodayService, useValue: { read } },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: TENANT_ID,
        role: 'pm',
        email: 'pm@example.test',
      }
      next()
    })
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    )
    await app.init()
    close = () => app.close()
    return app
  }

  it('normalizes the query and forwards the verified principal', async () => {
    const read = vi.fn().mockResolvedValue({
      summary: { dueToday: 0, overdue: 0, upcoming: 0 },
      tasks: [],
      projects: [],
    })
    const app = await appFor(read)

    await request(app.getHttpServer())
      .get('/v1/today?includeProjects=true')
      .expect(200)

    expect(read).toHaveBeenCalledWith(
      { includeProjects: true },
      expect.objectContaining({ tenantId: TENANT_ID, role: 'pm' })
    )
  })

  it('rejects browser-controlled time or unknown query fields', async () => {
    const read = vi.fn()
    const app = await appFor(read)

    await request(app.getHttpServer())
      .get('/v1/today?asOf=2026-08-10')
      .expect(400)
    expect(read).not.toHaveBeenCalled()
  })
})
