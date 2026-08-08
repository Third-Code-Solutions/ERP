import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CortexBriefController } from './cortex-brief.controller'
import { CortexBriefService } from './cortex-brief.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Cortex brief HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(read = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CortexBriefController],
      providers: [
        {
          provide: CortexBriefService,
          useValue: { read },
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
    const read = vi.fn()
    const app = await appFor(read)

    await request(app.getHttpServer())
      .get('/v1/cortex/brief?limit=6&tenantId=bad')
      .expect(400)

    expect(read).not.toHaveBeenCalled()
  })

  it('forwards only the bounded query and verified principal', async () => {
    const read = vi.fn().mockResolvedValue({
      generatedAt: '2026-08-09T00:00:00.000Z',
      stats: { nodes: 0, edges: 0, provenance: 0, byType: [] },
      freshness: { fresh: 0, stale: 0, unknown: 0 },
      items: [],
    })
    const app = await appFor(read)

    await request(app.getHttpServer())
      .get('/v1/cortex/brief?limit=7')
      .expect(200)

    expect(read).toHaveBeenCalledWith(
      { limit: 7 },
      expect.objectContaining({ tenantId: TENANT_ID, role: 'viewer' })
    )
  })
})
