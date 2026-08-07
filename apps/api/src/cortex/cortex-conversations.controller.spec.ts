import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CortexConversationsController } from './cortex-conversations.controller'
import { CortexConversationsService } from './cortex-conversations.service'
import { CortexConversationTurnsService } from './cortex-conversation-turns.service'
import { CortexAssistantTurnsService } from './cortex-assistant-turns.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const USER_MESSAGE_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const CLAIM_TOKEN = '66666666-6666-4666-8666-666666666666'

describe('Cortex conversation HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(
    list = vi.fn(),
    read = vi.fn(),
    appendUserTurn = vi.fn(),
    claim = vi.fn(),
    complete = vi.fn()
  ) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CortexConversationsController],
      providers: [
        {
          provide: CortexConversationsService,
          useValue: { list, read },
        },
        {
          provide: CortexConversationTurnsService,
          useValue: { appendUserTurn },
        },
        {
          provide: CortexAssistantTurnsService,
          useValue: { claim, complete },
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

  it('requires idempotency and forwards only the verified principal', async () => {
    const appendUserTurn = vi.fn().mockResolvedValue({
      conversationId: CONVERSATION_ID,
      messageId: '44444444-4444-4444-8444-444444444444',
      status: 'created',
    })
    const app = await appFor(vi.fn(), vi.fn(), appendUserTurn)

    await request(app.getHttpServer())
      .post('/v1/cortex/conversations/user-turns')
      .send({ content: 'What changed?' })
      .expect(400)
    expect(appendUserTurn).not.toHaveBeenCalled()

    await request(app.getHttpServer())
      .post('/v1/cortex/conversations/user-turns')
      .set('Idempotency-Key', 'turn-1')
      .send({ content: 'What changed?' })
      .expect(201)
    expect(appendUserTurn).toHaveBeenCalledWith(
      { content: 'What changed?' },
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID }),
      'turn-1'
    )
  })

  it('rejects browser-supplied identity and assistant roles', async () => {
    const appendUserTurn = vi.fn()
    const app = await appFor(vi.fn(), vi.fn(), appendUserTurn)

    await request(app.getHttpServer())
      .post('/v1/cortex/conversations/user-turns')
      .set('Idempotency-Key', 'turn-2')
      .send({
        content: 'Fabricated answer',
        tenantId: TENANT_ID,
        role: 'assistant',
      })
      .expect(400)
    expect(appendUserTurn).not.toHaveBeenCalled()
  })

  it('forwards signed assistant claim headers and principal', async () => {
    const claim = vi.fn().mockResolvedValue({
      status: 'claimed',
      conversationId: CONVERSATION_ID,
      userMessageId: USER_MESSAGE_ID,
      requestId: REQUEST_ID,
      claimToken: CLAIM_TOKEN,
      leaseExpiresAt: '2026-08-07T00:01:00.000Z',
    })
    const app = await appFor(vi.fn(), vi.fn(), vi.fn(), claim)

    await request(app.getHttpServer())
      .post('/v1/cortex/conversations/assistant-turns/claims')
      .set('Idempotency-Key', 'assistant-1')
      .set('X-Third-Code-Timestamp', '1786120000')
      .set('X-Third-Code-Cortex-Signature', `v1=${'a'.repeat(64)}`)
      .send({
        conversationId: CONVERSATION_ID,
        userMessageId: USER_MESSAGE_ID,
      })
      .expect(201)

    expect(claim).toHaveBeenCalledWith(
      {
        conversationId: CONVERSATION_ID,
        userMessageId: USER_MESSAGE_ID,
      },
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID }),
      'assistant-1',
      {
        timestamp: '1786120000',
        signature: `v1=${'a'.repeat(64)}`,
      }
    )
  })

  it('rejects caller-selected authority before assistant completion', async () => {
    const complete = vi.fn()
    const app = await appFor(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      complete
    )

    await request(app.getHttpServer())
      .post('/v1/cortex/conversations/assistant-turns/complete')
      .set('Idempotency-Key', 'assistant-1')
      .set('X-Third-Code-Timestamp', '1786120000')
      .set('X-Third-Code-Cortex-Signature', `v1=${'a'.repeat(64)}`)
      .send({
        requestId: REQUEST_ID,
        claimToken: CLAIM_TOKEN,
        content: 'Fabricated answer',
        citationNodeIds: [],
        outcome: 'deterministic_grounded',
        model: 'deterministic-grounded',
        tenantId: TENANT_ID,
        role: 'assistant',
      })
      .expect(400)

    expect(complete).not.toHaveBeenCalled()
  })
})
