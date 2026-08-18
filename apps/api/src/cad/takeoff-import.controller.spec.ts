import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { TakeoffImportController } from './takeoff-import.controller'
import { TakeoffImportService } from './takeoff-import.service'

const BOM_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const SOURCE_KEY = 'a'.repeat(64)
const COMMAND = {
  mode: 'preview',
  bomId: BOM_ID,
  source: 'generic',
  drawingRevisionKey: 'drawing-1',
  fileName: 'takeoff.csv',
  contentSha256: SOURCE_KEY,
  mapping: {
    description: 'Description',
    quantity: 'Qty',
    unit: 'UOM',
  },
  missingColumns: [],
  rows: [],
}

describe('takeoff import HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(execute = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [TakeoffImportController],
      providers: [{ provide: TakeoffImportService, useValue: { execute } }],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: TENANT_ID,
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

  it('rejects browser-supplied tenant or actor authority', async () => {
    const execute = vi.fn()
    const app = await appFor(execute)

    await request(app.getHttpServer())
      .post('/v1/boms/takeoff-import')
      .send({
        ...COMMAND,
        tenantId: '44444444-4444-4444-8444-444444444444',
        actorId: '55555555-5555-4555-8555-555555555555',
      })
      .expect(400)

    expect(execute).not.toHaveBeenCalled()
  })

  it('forwards only the validated command and authenticated principal', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      mode: 'preview',
      tenantId: TENANT_ID,
      bomId: BOM_ID,
      source: 'generic',
      sourceKey: SOURCE_KEY,
      drawingRevisionKey: COMMAND.drawingRevisionKey,
      contentSha256: COMMAND.contentSha256,
      rowCount: 0,
      validCount: 0,
      unresolvedCount: 0,
      missingColumns: [],
      validationIssues: [],
      rows: [],
    })
    const app = await appFor(execute)

    await request(app.getHttpServer())
      .post('/v1/boms/takeoff-import')
      .send(COMMAND)
      .expect(200)

    expect(execute).toHaveBeenCalledWith(
      { ...COMMAND, target: 'existing_bom' },
      expect.objectContaining({
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: TENANT_ID,
      })
    )
  })
})
