import 'reflect-metadata'

import { Test } from '@nestjs/testing'
import { ValidationPipe } from '@nestjs/common'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { TogalBomCommitController } from './togal-bom-commit.controller'
import { TogalBomCommitService } from './togal-bom-commit.service'

const COMMAND = {
  bomId: '33333333-3333-4333-8333-333333333333',
  proposedLines: [
    {
      description: 'Concrete',
      qty: 2,
      unitCostCents: 100,
    },
  ],
}

describe('Togal BOM commit HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(commit = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [TogalBomCommitController],
      providers: [
        {
          provide: TogalBomCommitService,
          useValue: { commit },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: '22222222-2222-4222-8222-222222222222',
        role: 'commercial',
        email: 'commercial@example.test',
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

  it('requires idempotency before command authority', async () => {
    const commit = vi.fn()
    const app = await appFor(commit)
    await request(app.getHttpServer())
      .post('/v1/procurement/boms/togal-commit')
      .send(COMMAND)
      .expect(400)
    expect(commit).not.toHaveBeenCalled()
  })

  it('rejects caller authority fields and forwards strict command', async () => {
    const commit = vi.fn().mockResolvedValue({
      ok: true,
      linesCreated: 1,
      bomId: COMMAND.bomId,
      tenantId: '22222222-2222-4222-8222-222222222222',
      totalCostCents: 200,
      tcvCents: 260,
      gpCents: 60,
      gpMarginBps: 2_308,
    })
    const app = await appFor(commit)
    await request(app.getHttpServer())
      .post('/v1/procurement/boms/togal-commit')
      .set('Idempotency-Key', ' togal-1 ')
      .send({ ...COMMAND, tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
      .expect(400)
    expect(commit).not.toHaveBeenCalled()

    await request(app.getHttpServer())
      .post('/v1/procurement/boms/togal-commit')
      .set('Idempotency-Key', ' togal-1 ')
      .send(COMMAND)
      .expect(200)
    expect(commit).toHaveBeenCalledWith(
      COMMAND,
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
        userId: '11111111-1111-4111-8111-111111111111',
      }),
      'togal-1'
    )
  })
})
