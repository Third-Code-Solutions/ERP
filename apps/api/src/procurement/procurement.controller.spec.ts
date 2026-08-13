import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { ProcurementController } from './procurement.controller'
import { ProcurementService } from './procurement.service'

const RFQ_ID = '33333333-3333-4333-8333-333333333333'
const QUOTE_ID = '77777777-7777-4777-8777-777777777777'
const COMMAND = {
  submissionId: '66666666-6666-4666-8666-666666666666',
  bomLineItemId: '44444444-4444-4444-8444-444444444444',
  vendorId: '55555555-5555-4555-8555-555555555555',
  unitPriceCents: 12_345,
}

describe('Procurement RFQ quote HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(
    logQuote: ReturnType<typeof vi.fn>,
    transitionRfq = vi.fn().mockResolvedValue({
      rfqId: RFQ_ID,
      tenantId: '22222222-2222-4222-8222-222222222222',
      transitioned: true,
    }),
    awardRfqQuote = vi.fn().mockResolvedValue({
      rfqId: RFQ_ID,
      quoteId: QUOTE_ID,
      tenantId: '22222222-2222-4222-8222-222222222222',
      priceHistoryId: '88888888-8888-4888-8888-888888888888',
      awarded: true,
    })
  ) {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProcurementController],
      providers: [
        {
          provide: ProcurementService,
          useValue: {
            logQuote,
            transitionRfq,
            awardQuote: awardRfqQuote,
          },
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
    'preserves the strict quote result contract',
    async () => {
      const logQuote = vi.fn().mockResolvedValue({
        quoteId: '77777777-7777-4777-8777-777777777777',
        created: true,
        statusChanged: true,
        priceHistoryId: '88888888-8888-4888-8888-888888888888',
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

  it('routes a strict award command and rejects authority injection', async () => {
    const logQuote = vi.fn()
    const awardRfqQuote = vi.fn().mockResolvedValue({
      rfqId: RFQ_ID,
      quoteId: QUOTE_ID,
      tenantId: '22222222-2222-4222-8222-222222222222',
      priceHistoryId: '88888888-8888-4888-8888-888888888888',
      awarded: true,
    })
    const app = await appFor(logQuote, undefined, awardRfqQuote)

    await request(app.getHttpServer())
      .post(`/v1/procurement/rfqs/${RFQ_ID}/quotes/${QUOTE_ID}/award`)
      .send({})
      .expect(201)

    expect(awardRfqQuote).toHaveBeenCalledWith(
      RFQ_ID,
      QUOTE_ID,
      {},
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
      }),
    )

    await request(app.getHttpServer())
      .post(`/v1/procurement/rfqs/${RFQ_ID}/quotes/${QUOTE_ID}/award`)
      .send({ tenantId: 'foreign' })
      .expect(400)
    expect(awardRfqQuote).toHaveBeenCalledOnce()
  })

  it('routes strict complete and cancel commands to the tenant service', async () => {
    const logQuote = vi.fn()
    const transitionRfq = vi.fn().mockResolvedValue({
      rfqId: RFQ_ID,
      tenantId: '22222222-2222-4222-8222-222222222222',
      transitioned: true,
    })
    const app = await appFor(logQuote, transitionRfq)

    await request(app.getHttpServer())
      .post(`/v1/procurement/rfqs/${RFQ_ID}/complete`)
      .send({})
      .expect(201)
    await request(app.getHttpServer())
      .post(`/v1/procurement/rfqs/${RFQ_ID}/cancel`)
      .send({ reason: 'Supplier withdrew' })
      .expect(201)

    expect(transitionRfq).toHaveBeenNthCalledWith(
      1,
      RFQ_ID,
      { command: 'complete' },
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
      })
    )
    expect(transitionRfq).toHaveBeenNthCalledWith(
      2,
      RFQ_ID,
      { command: 'cancel', reason: 'Supplier withdrew' },
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
      })
    )

    await request(app.getHttpServer())
      .post(`/v1/procurement/rfqs/${RFQ_ID}/cancel`)
      .send({ reason: 'Supplier withdrew', tenantId: 'foreign' })
      .expect(400)
    expect(transitionRfq).toHaveBeenCalledTimes(2)
  })
})
