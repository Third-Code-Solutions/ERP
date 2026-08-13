import 'reflect-metadata'

import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CortexSemanticIndexController } from './cortex-semantic-index.controller'
import { CortexSemanticIndexJobQueue } from './cortex-semantic-index.queue'
import { CortexSemanticIndexService } from './cortex-semantic-index.service'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const STATUS = {
  jobId: JOB_ID,
  status: 'queued' as const,
  maxNodes: 64 as const,
  backlogAtRequest: 75,
  processedNodes: 0,
  attempts: 0,
  providerCalls: 0,
  failureCode: null,
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
}

describe('Cortex semantic index HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(
    create = vi.fn().mockResolvedValue({ status: STATUS, created: true }),
    enqueue = vi.fn().mockResolvedValue(true),
    status = vi.fn().mockResolvedValue(STATUS)
  ) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CortexSemanticIndexController],
      providers: [
        { provide: CortexSemanticIndexService, useValue: { create, status } },
        { provide: CortexSemanticIndexJobQueue, useValue: { enqueue } },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '22222222-2222-4222-8222-222222222222',
        tenantId: '33333333-3333-4333-8333-333333333333',
        role: 'admin',
        email: 'admin@example.test',
      }
      next()
    })
    await app.init()
    close = () => app.close()
    return { app, create, enqueue, status }
  }

  it('requires explicit consent and idempotency', async () => {
    const probe = await appFor()
    await request(probe.app.getHttpServer())
      .post('/v1/cortex/semantic-index-jobs')
      .send({ maxNodes: 64, costConsent: true })
      .expect(400)
    await request(probe.app.getHttpServer())
      .post('/v1/cortex/semantic-index-jobs')
      .set('Idempotency-Key', 'index-1')
      .send({ maxNodes: 64, costConsent: false })
      .expect(400)
    expect(probe.create).not.toHaveBeenCalled()
  }, 30_000)

  it('accepts one bounded job and enqueues only opaque identity', async () => {
    const probe = await appFor()
    await request(probe.app.getHttpServer())
      .post('/v1/cortex/semantic-index-jobs')
      .set('Idempotency-Key', ' index-1 ')
      .send({ maxNodes: 64, costConsent: true })
      .expect(202)
      .expect(({ body }) =>
        expect(body).toEqual({
          jobId: JOB_ID,
          status: 'queued',
          maxNodes: 64,
          backlogAtRequest: 75,
          createdAt: STATUS.createdAt,
        })
      )
    expect(probe.create).toHaveBeenCalledWith(
      { maxNodes: 64, costConsent: true },
      expect.objectContaining({ role: 'admin' }),
      'index-1'
    )
    expect(probe.enqueue).toHaveBeenCalledWith(JOB_ID)
  }, 30_000)

  it('returns replay and tenant-scoped status without a second enqueue', async () => {
    const terminal = {
      ...STATUS,
      status: 'succeeded' as const,
      processedNodes: 64,
      providerCalls: 1,
    }
    const probe = await appFor(
      vi.fn().mockResolvedValue({ status: terminal, created: false }),
      vi.fn(),
      vi.fn().mockResolvedValue(terminal)
    )
    await request(probe.app.getHttpServer())
      .post('/v1/cortex/semantic-index-jobs')
      .set('Idempotency-Key', 'index-1')
      .send({ maxNodes: 64, costConsent: true })
      .expect(200)
    expect(probe.enqueue).not.toHaveBeenCalled()

    await request(probe.app.getHttpServer())
      .get(`/v1/cortex/semantic-index-jobs/${JOB_ID}`)
      .expect(200)
    expect(probe.status).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({
        tenantId: '33333333-3333-4333-8333-333333333333',
      })
    )
  }, 30_000)
})
