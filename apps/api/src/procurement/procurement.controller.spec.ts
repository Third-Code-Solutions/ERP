import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { ProcurementController } from './procurement.controller'
import { ProcurementService } from './procurement.service'
import { RfqDispatchQueue } from './rfq-dispatch.queue'

const RFQ_ID = '33333333-3333-4333-8333-333333333333'
const BOM_ID = '88888888-8888-4888-8888-888888888888'
const COMMAND = {
  submissionId: '66666666-6666-4666-8666-666666666666',
  bomLineItemId: '44444444-4444-4444-8444-444444444444',
  vendorId: '55555555-5555-4555-8555-555555555555',
  unitPriceCents: 12_345,
}

describe('Procurement RFQ HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(
    logQuote: ReturnType<typeof vi.fn>,
    transition = vi.fn(),
    create = vi.fn(),
    enqueue = vi.fn()
  ) {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProcurementController],
      providers: [
        {
          provide: ProcurementService,
          useValue: { create, logQuote, transition },
        },
        {
          provide: RfqDispatchQueue,
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
          role: 'procurement',
          email: 'procurement@example.test',
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

  it(
    'preserves the strict RFQ creation result contract',
    async () => {
      const create = vi.fn().mockResolvedValue({
        rfqId: RFQ_ID,
        tenantId: '22222222-2222-4222-8222-222222222222',
        projectId: '99999999-9999-4999-8999-999999999999',
        lineCount: 2,
        created: true,
      })
      const app = await appFor(vi.fn(), vi.fn(), create)

      const response = await request(app.getHttpServer())
        .post('/v1/procurement/rfqs')
        .send({ bomId: BOM_ID })
        .expect(200)

      expect(response.body).toEqual({
        rfqId: RFQ_ID,
        tenantId: '22222222-2222-4222-8222-222222222222',
        projectId: '99999999-9999-4999-8999-999999999999',
        lineCount: 2,
        created: true,
      })
      expect(create).toHaveBeenCalledWith(
        { bomId: BOM_ID },
        expect.objectContaining({
          tenantId: '22222222-2222-4222-8222-222222222222',
        })
      )
    },
    30_000
  )

  it('rejects caller-supplied RFQ creation authority', async () => {
    const create = vi.fn()
    const app = await appFor(vi.fn(), vi.fn(), create)

    await request(app.getHttpServer())
      .post('/v1/procurement/rfqs')
      .send({
        bomId: BOM_ID,
        tenantId: '22222222-2222-4222-8222-222222222222',
      })
      .expect(400)

    expect(create).not.toHaveBeenCalled()
  })

  it('accepts strict approved-BOM dispatch and returns 202', async () => {
    const enqueue = vi.fn().mockResolvedValue({
      jobId:
        'rfq1-22222222-2222-4222-8222-222222222222-88888888-8888-4888-8888-888888888888',
      enqueued: true,
    })
    const app = await appFor(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      enqueue
    )

    const response = await request(app.getHttpServer())
      .post('/v1/procurement/rfqs/dispatch')
      .send({ bomId: BOM_ID })
      .expect(202)

    expect(response.body).toEqual({
      jobId:
        'rfq1-22222222-2222-4222-8222-222222222222-88888888-8888-4888-8888-888888888888',
      enqueued: true,
    })
    expect(enqueue).toHaveBeenCalledWith(
      { bomId: BOM_ID },
      expect.objectContaining({
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: '22222222-2222-4222-8222-222222222222',
      })
    )
  })

  it('rejects caller-supplied dispatch authority', async () => {
    const enqueue = vi.fn()
    const app = await appFor(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      enqueue
    )

    await request(app.getHttpServer())
      .post('/v1/procurement/rfqs/dispatch')
      .send({
        bomId: BOM_ID,
        actorId: '11111111-1111-4111-8111-111111111111',
      })
      .expect(400)

    expect(enqueue).not.toHaveBeenCalled()
  })

  it(
    'preserves the strict quote result contract',
    async () => {
      const logQuote = vi.fn().mockResolvedValue({
        quoteId: '77777777-7777-4777-8777-777777777777',
        created: true,
        statusChanged: true,
      })
      const app = await appFor(logQuote)

      const response = await request(app.getHttpServer())
        .post(`/v1/procurement/rfqs/${RFQ_ID}/quotes`)
        .send(COMMAND)
        .expect(201)

      expect(response.body).toMatchObject({
        quoteId: '77777777-7777-4777-8777-777777777777',
        created: true,
        statusChanged: true,
      })
      expect(logQuote).toHaveBeenCalledOnce()
    },
    30_000
  )

  it('rejects unknown authority fields', async () => {
    const logQuote = vi.fn()
    const app = await appFor(logQuote)

    await request(app.getHttpServer())
      .post(`/v1/procurement/rfqs/${RFQ_ID}/quotes`)
      .send({
        ...COMMAND,
        tenantId: '22222222-2222-4222-8222-222222222222',
      })
      .expect(400)
    expect(logQuote).not.toHaveBeenCalled()
  })

  it('preserves the strict terminal-transition result contract', async () => {
    const logQuote = vi.fn()
    const transition = vi.fn().mockResolvedValue({
      rfqId: RFQ_ID,
      tenantId: '22222222-2222-4222-8222-222222222222',
      transitioned: true,
    })
    const app = await appFor(logQuote, transition)

    const response = await request(app.getHttpServer())
      .post(`/v1/procurement/rfqs/${RFQ_ID}/transitions`)
      .send({ command: 'complete' })
      .expect(200)

    expect(response.body).toEqual({
      rfqId: RFQ_ID,
      tenantId: '22222222-2222-4222-8222-222222222222',
      transitioned: true,
    })
    expect(transition).toHaveBeenCalledWith(
      RFQ_ID,
      { command: 'complete' },
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
      })
    )
  })

  it('rejects invalid terminal commands before service authority', async () => {
    const logQuote = vi.fn()
    const transition = vi.fn()
    const app = await appFor(logQuote, transition)

    await request(app.getHttpServer())
      .post(`/v1/procurement/rfqs/${RFQ_ID}/transitions`)
      .send({
        command: 'complete',
        tenantId: '22222222-2222-4222-8222-222222222222',
      })
      .expect(400)
    await request(app.getHttpServer())
      .post(`/v1/procurement/rfqs/${RFQ_ID}/transitions`)
      .send({ command: 'cancel', reason: ' ' })
      .expect(400)

    expect(transition).not.toHaveBeenCalled()
  })
})
