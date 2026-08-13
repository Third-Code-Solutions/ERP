import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { JournalPostController } from './journal-post.controller'
import { JournalPostService } from './journal-post.service'

const JOURNAL_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('Journal post command HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(post = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [JournalPostController],
      providers: [
        {
          provide: JournalPostService,
          useValue: { post },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use(
      (
        req: Request,
        _res: Response,
        next: NextFunction
      ) => {
        ;(req as AuthenticatedRequest).principal = {
          userId: USER_ID,
          tenantId: TENANT_ID,
          role: 'finance',
          email: 'finance@example.test',
        }
        next()
      }
    )
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

  it('requires an idempotency key before the command boundary', async () => {
    const post = vi.fn()
    const app = await appFor(post)

    await request(app.getHttpServer())
      .post(`/v1/finance/journals/${JOURNAL_ID}/post`)
      .expect(400)

    expect(post).not.toHaveBeenCalled()
  }, 30_000)

  it('forwards only route authority and the authenticated principal', async () => {
    const post = vi.fn().mockResolvedValue({
      journalEntryId: JOURNAL_ID,
      tenantId: TENANT_ID,
      postedNumber: 'JE-2026-000001',
    })
    const app = await appFor(post)

    await request(app.getHttpServer())
      .post(`/v1/finance/journals/${JOURNAL_ID}/post`)
      .set('Idempotency-Key', ' journal-post-1 ')
      .send({ tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
      .expect(200)

    expect(post).toHaveBeenCalledWith(
      JOURNAL_ID,
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
      }),
      'journal-post-1'
    )
  }, 30_000)
})
