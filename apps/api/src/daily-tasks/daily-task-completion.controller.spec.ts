import 'reflect-metadata'

import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { DailyTaskCompletionController } from './daily-task-completion.controller'
import { DailyTaskCompletionPipe } from './daily-task-completion.pipe'
import { DailyTaskCompletionService } from './daily-task-completion.service'

const TASK_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'

describe('Daily task completion HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(complete = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [DailyTaskCompletionController],
      providers: [
        DailyTaskCompletionPipe,
        { provide: DailyTaskCompletionService, useValue: { complete } },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: USER_ID,
        tenantId: TENANT_ID,
        role: 'safety',
        email: 'safety@example.test',
      }
      next()
    })
    await app.init()
    close = () => app.close()
    return app
  }

  it('requires a bounded idempotency key before invoking Core', async () => {
    const complete = vi.fn()
    const app = await appFor(complete)
    await request(app.getHttpServer())
      .post(`/v1/daily-tasks/${TASK_ID}/completion`)
      .send({})
      .expect(400)
    await request(app.getHttpServer())
      .post(`/v1/daily-tasks/${TASK_ID}/completion`)
      .set('Idempotency-Key', 'x'.repeat(257))
      .send({})
      .expect(400)
    expect(complete).not.toHaveBeenCalled()
  })

  it('rejects malformed task ids and caller-owned identity fields', async () => {
    const complete = vi.fn()
    const app = await appFor(complete)
    await request(app.getHttpServer())
      .post('/v1/daily-tasks/not-a-uuid/completion')
      .set('Idempotency-Key', 'task-complete-1')
      .send({})
      .expect(400)
    await request(app.getHttpServer())
      .post(`/v1/daily-tasks/${TASK_ID}/completion`)
      .set('Idempotency-Key', 'task-complete-1')
      .send({ tenantId: TENANT_ID, actorId: USER_ID, status: 'done' })
      .expect(400)
    expect(complete).not.toHaveBeenCalled()
  })

  it('forwards only normalized notes, the trusted principal, and trimmed key', async () => {
    const complete = vi.fn().mockResolvedValue({ ok: true })
    const app = await appFor(complete)
    await request(app.getHttpServer())
      .post(`/v1/daily-tasks/${TASK_ID}/completion`)
      .set('Idempotency-Key', ' task-complete-1 ')
      .send({ notes: '  Toolbox discussed  ' })
      .expect(200)
    expect(complete).toHaveBeenCalledWith(
      TASK_ID,
      { notes: 'Toolbox discussed' },
      expect.objectContaining({
        userId: USER_ID,
        tenantId: TENANT_ID,
        role: 'safety',
      }),
      'task-complete-1'
    )
  })
})
