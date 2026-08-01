import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { DocumentProcessingJobQueue } from './document-processing.queue'
import { DocumentProcessingController } from './document-processing.controller'
import { DocumentProcessingService } from './document-processing.service'

const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'
const JOB_ID = '44444444-4444-4444-8444-444444444444'
const COMMAND = {
  mode: 'cad',
  requestedFormat: 'auto',
  createDraftBom: true,
}
const STATUS = {
  jobId: JOB_ID,
  documentId: DOCUMENT_ID,
  status: 'queued' as const,
  attempts: 0,
  scopeItemsCreated: 0,
  draftBomId: null,
  warnings: [],
  failureCode: null,
  createdAt: '2026-08-01T13:00:00.000Z',
  updatedAt: '2026-08-01T13:00:00.000Z',
}

describe('document processing HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(
    create = vi.fn().mockResolvedValue({ status: STATUS, created: true }),
    enqueue = vi.fn().mockResolvedValue({ jobId: JOB_ID, enqueued: true }),
    status = vi.fn().mockResolvedValue(STATUS)
  ) {
    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentProcessingController],
      providers: [
        {
          provide: DocumentProcessingService,
          useValue: { create, status },
        },
        {
          provide: DocumentProcessingJobQueue,
          useValue: { enqueue },
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
          userId: '11111111-1111-4111-8111-111111111111',
          tenantId: '22222222-2222-4222-8222-222222222222',
          role: 'pm',
          email: 'pm@example.test',
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
    return { app, create, enqueue, status }
  }

  it('requires an idempotency key before the processing boundary', async () => {
    const harness = await appFor()
    await request(harness.app.getHttpServer())
      .post(`/v1/documents/${DOCUMENT_ID}/processing-jobs`)
      .send(COMMAND)
      .expect(400)
    expect(harness.create).not.toHaveBeenCalled()
  }, 30_000)

  it('rejects browser-supplied tenant or actor authority', async () => {
    const harness = await appFor()
    await request(harness.app.getHttpServer())
      .post(`/v1/documents/${DOCUMENT_ID}/processing-jobs`)
      .set('Idempotency-Key', 'job-1')
      .send({
        ...COMMAND,
        tenantId: '66666666-6666-4666-8666-666666666666',
        actorId: '77777777-7777-4777-8777-777777777777',
      })
      .expect(400)
    expect(harness.create).not.toHaveBeenCalled()
  }, 30_000)

  it('forwards the validated command and enqueues only opaque job identity', async () => {
    const harness = await appFor()
    await request(harness.app.getHttpServer())
      .post(`/v1/documents/${DOCUMENT_ID}/processing-jobs`)
      .set('Idempotency-Key', ' job-1 ')
      .send(COMMAND)
      .expect(202)
      .expect(({ body }) => {
        expect(body).toEqual({
          jobId: JOB_ID,
          status: 'queued',
          documentId: DOCUMENT_ID,
          createdAt: STATUS.createdAt,
        })
      })

    expect(harness.create).toHaveBeenCalledWith(
      DOCUMENT_ID,
      COMMAND,
      expect.objectContaining({ tenantId: '22222222-2222-4222-8222-222222222222' }),
      'job-1'
    )
    expect(harness.enqueue).toHaveBeenCalledWith(JOB_ID)
  }, 30_000)

  it('returns the full terminal state on an idempotent replay', async () => {
    const terminal = { ...STATUS, status: 'succeeded' as const }
    const harness = await appFor(
      vi.fn().mockResolvedValue({ status: terminal, created: false })
    )
    await request(harness.app.getHttpServer())
      .post(`/v1/documents/${DOCUMENT_ID}/processing-jobs`)
      .set('Idempotency-Key', 'job-1')
      .send(COMMAND)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('succeeded'))
    expect(harness.enqueue).not.toHaveBeenCalled()
  }, 30_000)

  it('reads a job through the tenant-aware status boundary', async () => {
    const harness = await appFor()
    await request(harness.app.getHttpServer())
      .get(`/v1/document-processing-jobs/${JOB_ID}`)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual(STATUS))
    expect(harness.status).toHaveBeenCalledWith(
      JOB_ID,
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
      })
    )
  }, 30_000)
})
