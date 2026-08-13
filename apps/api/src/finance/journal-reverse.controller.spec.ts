import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { JournalReverseController } from './journal-reverse.controller'
import { JournalReverseService } from './journal-reverse.service'

const JOURNAL_ID = '33333333-3333-4333-8333-333333333333'
const BODY = {
  reason: 'Correct duplicate accrual',
  postingDate: '2026-08-02',
}

describe('Journal reversal command HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(reverse = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [JournalReverseController],
      providers: [
        {
          provide: JournalReverseService,
          useValue: { reverse },
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
          userId: '44444444-4444-4444-8444-444444444444',
          tenantId: '55555555-5555-4555-8555-555555555555',
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
    const reverse = vi.fn()
    const app = await appFor(reverse)

    await request(app.getHttpServer())
      .post(`/v1/finance/journals/${JOURNAL_ID}/reverse`)
      .send(BODY)
      .expect(400)

    expect(reverse).not.toHaveBeenCalled()
  })

  it('keeps tenant and actor authority out of the browser command', async () => {
    const reverse = vi.fn()
    const app = await appFor(reverse)

    await request(app.getHttpServer())
      .post(`/v1/finance/journals/${JOURNAL_ID}/reverse`)
      .set('Idempotency-Key', 'journal-reverse-1')
      .send({ ...BODY, tenantId: '66666666-6666-4666-8666-666666666666' })
      .expect(400)

    expect(reverse).not.toHaveBeenCalled()
  })

  it('forwards the validated body, route id, and request principal', async () => {
    const reverse = vi.fn().mockResolvedValue({
      journalEntryId: JOURNAL_ID,
      tenantId: '55555555-5555-4555-8555-555555555555',
      reversalJournalEntryId: '77777777-7777-4777-8777-777777777777',
      reversalNumber: 'JE-2026-000002',
    })
    const app = await appFor(reverse)

    await request(app.getHttpServer())
      .post(`/v1/finance/journals/${JOURNAL_ID}/reverse`)
      .set('Idempotency-Key', ' journal-reverse-1 ')
      .send(BODY)
      .expect(200)

    expect(reverse).toHaveBeenCalledWith(
      JOURNAL_ID,
      BODY,
      expect.objectContaining({
        tenantId: '55555555-5555-4555-8555-555555555555',
        userId: '44444444-4444-4444-8444-444444444444',
      }),
      'journal-reverse-1'
    )
  })
})
