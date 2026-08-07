import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CortexConversationsController } from './cortex-conversations.controller'
import { CortexConversationsService } from './cortex-conversations.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'

describe('Cortex conversation HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(list = vi.fn(), read = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CortexConversationsController],
      providers: [
        {
          provide: CortexConversationsService,
          useValue: { list, read },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: USER_ID,
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

  it('forwards only the verified principal for list reads', async () => {
    const list = vi.fn().mockResolvedValue({ conversations: [] })
    const app = await appFor(list)

    await request(app.getHttpServer())
      .get('/v1/cortex/conversations')
      .expect(200)

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID })
    )
  })

  it('rejects malformed ids before service access', async () => {
    const read = vi.fn()
    const app = await appFor(vi.fn(), read)

    await request(app.getHttpServer())
      .get('/v1/cortex/conversations/not-a-uuid')
      .expect(400)

    expect(read).not.toHaveBeenCalled()
  })

  it('forwards a valid id with the verified principal', async () => {
    const read = vi.fn().mockResolvedValue({ context: null, messages: [] })
    const app = await appFor(vi.fn(), read)

    await request(app.getHttpServer())
      .get(`/v1/cortex/conversations/${CONVERSATION_ID}`)
      .expect(200)

    expect(read).toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID })
    )
  })
})
