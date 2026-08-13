import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { Request, Response, NextFunction } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CadEvidenceCommitController } from './cad-evidence-commit.controller'
import { CadEvidenceCommitService } from './cad-evidence-commit.service'

const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'
const COMMAND = {
  projectId: '44444444-4444-4444-8444-444444444444',
  workerResponse: {
    document_id: DOCUMENT_ID,
    scope_items: [],
    count: 0,
    warnings: [],
    parsed_format: 'dxf',
    source_format: 'dxf',
  },
}

describe('CAD evidence commit HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(commit = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CadEvidenceCommitController],
      providers: [
        {
          provide: CadEvidenceCommitService,
          useValue: { commit },
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
    return app
  }

  it('requires an idempotency key before the command boundary', async () => {
    const commit = vi.fn()
    const app = await appFor(commit)

    await request(app.getHttpServer())
      .post(`/v1/documents/${DOCUMENT_ID}/cad-evidence`)
      .send(COMMAND)
      .expect(400)

    expect(commit).not.toHaveBeenCalled()
  }, 30_000)

  it('rejects browser-supplied tenant or actor authority', async () => {
    const commit = vi.fn()
    const app = await appFor(commit)

    await request(app.getHttpServer())
      .post(`/v1/documents/${DOCUMENT_ID}/cad-evidence`)
      .set('Idempotency-Key', 'cad-commit-1')
      .send({
        ...COMMAND,
        tenantId: '66666666-6666-4666-8666-666666666666',
        actorId: '77777777-7777-4777-8777-777777777777',
      })
      .expect(400)

    expect(commit).not.toHaveBeenCalled()
  }, 30_000)

  it('forwards the path, validated command, principal, and trimmed key', async () => {
    const commit = vi.fn().mockResolvedValue({
      documentId: DOCUMENT_ID,
      projectId: COMMAND.projectId,
      tenantId: '22222222-2222-4222-8222-222222222222',
      scopeItemsCreated: 0,
      sourceFormat: 'dxf',
      status: 'committed',
    })
    const app = await appFor(commit)

    await request(app.getHttpServer())
      .post(`/v1/documents/${DOCUMENT_ID}/cad-evidence`)
      .set('Idempotency-Key', ' cad-commit-1 ')
      .send(COMMAND)
      .expect(200)

    expect(commit).toHaveBeenCalledWith(
      DOCUMENT_ID,
      COMMAND,
      expect.objectContaining({
        tenantId: '22222222-2222-4222-8222-222222222222',
        userId: '11111111-1111-4111-8111-111111111111',
      }),
      'cad-commit-1'
    )
  }, 30_000)
})
