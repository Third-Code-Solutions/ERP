import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CortexSearchController } from './cortex-search.controller'
import { CortexSearchService } from './cortex-search.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Cortex search HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(search = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CortexSearchController],
      providers: [
        {
          provide: CortexSearchService,
          useValue: { search },
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
    const search = vi.fn()
    const app = await appFor(search)

    await request(app.getHttpServer())
      .get('/v1/cortex/search?q=concrete&tenantId=bad')
      .expect(400)

    expect(search).not.toHaveBeenCalled()
  })

  it('forwards only bounded query input and the verified principal', async () => {
    const search = vi.fn().mockResolvedValue({ hits: [] })
    const app = await appFor(search)

    await request(app.getHttpServer())
      .get('/v1/cortex/search?q=Concrete%20Tower&limit=7')
      .expect(200)

    expect(search).toHaveBeenCalledWith(
      { q: 'Concrete Tower', limit: 7 },
      expect.objectContaining({ tenantId: TENANT_ID, role: 'viewer' })
    )
  })
})
