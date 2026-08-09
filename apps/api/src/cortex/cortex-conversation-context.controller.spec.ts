import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CortexConversationContextController } from './cortex-conversation-context.controller'
import { CortexConversationContextService } from './cortex-conversation-context.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const REF_ID = '44444444-4444-4444-8444-444444444444'

describe('Cortex conversation context HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(resolve = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CortexConversationContextController],
      providers: [
        {
          provide: CortexConversationContextService,
          useValue: { resolve },
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

  it('rejects malformed, incomplete, or caller-selected scope', async () => {
    const resolve = vi.fn()
    const app = await appFor(resolve)

    await request(app.getHttpServer())
      .get('/v1/cortex/conversation-context?conversationId=not-a-uuid')
      .expect(400)
    await request(app.getHttpServer())
      .get('/v1/cortex/conversation-context?context=%7B%22refTable%22%3A%22projects%22%7D')
      .expect(400)
    await request(app.getHttpServer())
      .get(`/v1/cortex/conversation-context?tenantId=${TENANT_ID}`)
      .expect(400)

    expect(resolve).not.toHaveBeenCalled()
  })

  it('parses JSON focus and forwards only the verified principal', async () => {
    const resolve = vi.fn().mockResolvedValue({
      conversationId: CONVERSATION_ID,
      context: null,
    })
    const app = await appFor(resolve)
    const encodedContext = encodeURIComponent(
      JSON.stringify({ refTable: 'projects', refId: REF_ID })
    )

    await request(app.getHttpServer())
      .get(
        `/v1/cortex/conversation-context?conversationId=${CONVERSATION_ID}&context=${encodedContext}`
      )
      .expect(200)

    expect(resolve).toHaveBeenCalledWith(
      {
        conversationId: CONVERSATION_ID,
        context: { refTable: 'projects', refId: REF_ID },
      },
      expect.objectContaining({ tenantId: TENANT_ID, userId: expect.any(String) })
    )
  })

  it('allows an empty query for an unscoped new chat', async () => {
    const resolve = vi.fn().mockResolvedValue({
      conversationId: null,
      context: null,
    })
    const app = await appFor(resolve)

    await request(app.getHttpServer())
      .get('/v1/cortex/conversation-context')
      .expect(200)
    expect(resolve).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ tenantId: TENANT_ID })
    )
  })
})
