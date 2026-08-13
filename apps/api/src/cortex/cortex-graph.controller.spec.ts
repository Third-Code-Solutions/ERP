import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CortexGraphController } from './cortex-graph.controller'
import { CortexGraphService } from './cortex-graph.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const REF_ID = '33333333-3333-4333-8333-333333333333'

describe('Cortex graph HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(read = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CortexGraphController],
      providers: [
        {
          provide: CortexGraphService,
          useValue: { read },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: TENANT_ID,
        role: 'finance',
        email: 'finance@example.test',
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

  it('rejects partial, unregistered, or caller-supplied scope', async () => {
    const read = vi.fn()
    const app = await appFor(read)

    await request(app.getHttpServer())
      .get('/v1/cortex/graph?refTable=journal_entries')
      .expect(400)
    await request(app.getHttpServer())
      .get(`/v1/cortex/graph?refTable=secret_records&refId=${REF_ID}`)
      .expect(400)
    await request(app.getHttpServer())
      .get(`/v1/cortex/graph?tenantId=${TENANT_ID}`)
      .expect(400)

    expect(read).not.toHaveBeenCalled()
  })

  it('forwards only a complete focus and the verified principal', async () => {
    const read = vi.fn().mockResolvedValue({
      focusNodeId: REF_ID,
      nodes: [],
      links: [],
    })
    const app = await appFor(read)

    await request(app.getHttpServer())
      .get(`/v1/cortex/graph?refTable=journal_entries&refId=${REF_ID}`)
      .expect(200)

    expect(read).toHaveBeenCalledWith(
      { refTable: 'journal_entries', refId: REF_ID },
      expect.objectContaining({ tenantId: TENANT_ID, role: 'finance' })
    )
  })
})
