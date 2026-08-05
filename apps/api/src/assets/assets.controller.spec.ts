import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { AssetsController } from './assets.controller'
import { AssetsService } from './assets.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Asset register HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(list = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [AssetsController],
      providers: [
        {
          provide: AssetsService,
          useValue: { list },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: TENANT_ID,
        role: 'viewer',
        email: 'viewer@example.test',
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

  it('rejects unsupported query fields before the service', async () => {
    const list = vi.fn()
    const app = await appFor(list)

    await request(app.getHttpServer())
      .get('/v1/assets?unexpected=true')
      .expect(400)

    expect(list).not.toHaveBeenCalled()
  })

  it('forwards bounded filters and the verified principal', async () => {
    const list = vi.fn().mockResolvedValue({
      rows: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    })
    const app = await appFor(list)

    await request(app.getHttpServer())
      .get(
        '/v1/assets?kind=equipment&status=active&sort=asset_tag&order=asc&page=2&limit=50'
      )
      .expect(200)

    expect(list).toHaveBeenCalledWith(
      {
        q: undefined,
        kind: 'equipment',
        status: 'active',
        sort: 'asset_tag',
        order: 'asc',
        page: 2,
        limit: 50,
      },
      expect.objectContaining({ tenantId: TENANT_ID, userId: expect.any(String) })
    )
  })
})
