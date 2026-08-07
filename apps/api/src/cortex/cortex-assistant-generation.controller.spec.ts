import 'reflect-metadata'

import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CortexAssistantGenerationController } from './cortex-assistant-generation.controller'
import { CortexAssistantGenerationJobQueue } from './cortex-assistant-generation.queue'
import { CortexAssistantGenerationService } from './cortex-assistant-generation.service'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const CLAIM_TOKEN = '44444444-4444-4444-8444-444444444444'
const JOB_ID = '55555555-5555-4555-8555-555555555555'
const STATUS = {
  jobId: JOB_ID,
  requestId: REQUEST_ID,
  status: 'queued' as const,
  attemptCount: 0,
  failureCode: null,
  retryable: false,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
}

describe('Cortex assistant generation job HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor() {
    const start = vi.fn().mockResolvedValue({ status: STATUS, enqueue: true })
    const status = vi.fn().mockResolvedValue(STATUS)
    const cancel = vi.fn().mockResolvedValue({
      ...STATUS,
      status: 'cancelled',
      failureCode: 'cancelled_by_user',
    })
    const enqueue = vi.fn().mockResolvedValue(true)
    const moduleRef = await Test.createTestingModule({
      controllers: [CortexAssistantGenerationController],
      providers: [
        {
          provide: CortexAssistantGenerationService,
          useValue: { start, status, cancel },
        },
        { provide: CortexAssistantGenerationJobQueue, useValue: { enqueue } },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        tenantId: TENANT_ID,
        userId: USER_ID,
        role: 'admin',
        email: 'admin@example.test',
      }
      next()
    })
    await app.init()
    close = () => app.close()
    return { app, start, status, cancel, enqueue }
  }

  it('forwards signed start identity and enqueues opaque job identity', async () => {
    const probe = await appFor()
    await request(probe.app.getHttpServer())
      .post('/v1/cortex/conversations/assistant-turns/jobs')
      .set('Idempotency-Key', 'assistant-job-1')
      .set('X-Third-Code-Timestamp', '1786120000')
      .set('X-Third-Code-Cortex-Signature', `v1=${'a'.repeat(64)}`)
      .send({ requestId: REQUEST_ID, claimToken: CLAIM_TOKEN })
      .expect(202)
      .expect(({ body }) => expect(body).toEqual(STATUS))
    expect(probe.start).toHaveBeenCalledWith(
      { requestId: REQUEST_ID, claimToken: CLAIM_TOKEN },
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID }),
      'assistant-job-1',
      {
        timestamp: '1786120000',
        signature: `v1=${'a'.repeat(64)}`,
      }
    )
    expect(probe.enqueue).toHaveBeenCalledWith(JOB_ID)
  }, 30_000)

  it('rejects malformed identity before start and status services', async () => {
    const probe = await appFor()
    await request(probe.app.getHttpServer())
      .post('/v1/cortex/conversations/assistant-turns/jobs')
      .set('Idempotency-Key', 'assistant-job-1')
      .send({ requestId: 'not-a-uuid', claimToken: CLAIM_TOKEN })
      .expect(400)
    await request(probe.app.getHttpServer())
      .get('/v1/cortex/conversations/assistant-turns/jobs/not-a-uuid')
      .expect(400)
    expect(probe.start).not.toHaveBeenCalled()
    expect(probe.status).not.toHaveBeenCalled()
  }, 30_000)

  it('requires idempotency for cancellation and forwards the principal', async () => {
    const probe = await appFor()
    await request(probe.app.getHttpServer())
      .post(
        `/v1/cortex/conversations/assistant-turns/jobs/${JOB_ID}/cancel`
      )
      .expect(400)
    await request(probe.app.getHttpServer())
      .post(
        `/v1/cortex/conversations/assistant-turns/jobs/${JOB_ID}/cancel`
      )
      .set('Idempotency-Key', 'assistant-job-1:cancel')
      .expect(200)
    expect(probe.cancel).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({ tenantId: TENANT_ID, userId: USER_ID })
    )
  }, 30_000)
})
