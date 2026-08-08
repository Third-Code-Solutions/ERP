import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CortexChatRetrievalController } from './cortex-chat-retrieval.controller'
import { CortexChatRetrievalService } from './cortex-chat-retrieval.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Cortex chat retrieval HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(retrieve = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CortexChatRetrievalController],
      providers: [
        {
          provide: CortexChatRetrievalService,
          useValue: { read: retrieve },
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
    const retrieve = vi.fn()
    const app = await appFor(retrieve)

    await request(app.getHttpServer())
      .get('/v1/cortex/chat-retrieval?query=invoice&tenantId=bad')
      .expect(400)

    expect(retrieve).not.toHaveBeenCalled()
  })

  it('forwards bounded retrieval input and the verified principal', async () => {
    const retrieve = vi.fn().mockResolvedValue({
      generatedAt: '2026-08-09T00:00:00.000Z',
      stats: { nodes: 0, edges: 0, provenance: 0, byType: [] },
      recent: [],
      matches: [],
      focused: null,
      keywordAnswer: { answer: '', citations: [] },
      semanticStatus: 'not_migrated',
    })
    const app = await appFor(retrieve)

    await request(app.getHttpServer())
      .get('/v1/cortex/chat-retrieval?query=Concrete%20Tower&recentLimit=6&matchLimit=4')
      .expect(200)

    expect(retrieve).toHaveBeenCalledWith(
      { query: 'Concrete Tower', recentLimit: 6, matchLimit: 4 },
      expect.objectContaining({ tenantId: TENANT_ID, role: 'viewer' })
    )
  })
})
