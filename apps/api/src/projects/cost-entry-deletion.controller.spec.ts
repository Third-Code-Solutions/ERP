import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CostEntryDeletionController } from './cost-entry-deletion.controller'
import { CostEntryDeletionService } from './cost-entry-deletion.service'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ENTRY_ID = '55555555-5555-4555-8555-555555555555'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('Cost entry deletion HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(remove = vi.fn(), restore = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [CostEntryDeletionController],
      providers: [
        {
          provide: CostEntryDeletionService,
          useValue: { delete: remove, restore },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: TENANT_ID,
        role: 'pm',
        email: 'pm@example.test',
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

  it('requires an idempotency key before the command boundary', async () => {
    const remove = vi.fn()
    const app = await appFor(remove)

    await request(app.getHttpServer())
      .delete(`/v1/projects/${PROJECT_ID}/cost-entries/${ENTRY_ID}`)
      .send({ reason: 'Duplicate' })
      .expect(400)

    expect(remove).not.toHaveBeenCalled()
  })

  it('rejects browser-owned identity fields and blank reasons', async () => {
    const remove = vi.fn()
    const app = await appFor(remove)

    await request(app.getHttpServer())
      .delete(`/v1/projects/${PROJECT_ID}/cost-entries/${ENTRY_ID}`)
      .set('Idempotency-Key', 'cost-delete-1')
      .send({ reason: ' ', tenantId: TENANT_ID, projectId: PROJECT_ID })
      .expect(400)

    expect(remove).not.toHaveBeenCalled()
  })

  it('forwards the scoped identifiers, bounded reason, and verified principal', async () => {
    const remove = vi.fn().mockResolvedValue({
      costEntryId: ENTRY_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      costSource: 'manual',
      status: 'voided',
      voidedAt: '2026-08-07T00:00:00.000Z',
      restorable: true,
    })
    const app = await appFor(remove)

    await request(app.getHttpServer())
      .delete(`/v1/projects/${PROJECT_ID}/cost-entries/${ENTRY_ID}`)
      .set('Idempotency-Key', 'cost-delete-1')
      .send({ reason: ' Duplicate manual entry ' })
      .expect(200)

    expect(remove).toHaveBeenCalledWith(
      PROJECT_ID,
      ENTRY_ID,
      'Duplicate manual entry',
      expect.objectContaining({ tenantId: TENANT_ID, role: 'pm' }),
      'cost-delete-1'
    )
  })

  it('requires an idempotency key for restore before the command boundary', async () => {
    const restore = vi.fn()
    const app = await appFor(vi.fn(), restore)

    await request(app.getHttpServer())
      .post(`/v1/projects/${PROJECT_ID}/cost-entries/${ENTRY_ID}/restore`)
      .send({ reason: 'Corrected' })
      .expect(400)

    expect(restore).not.toHaveBeenCalled()
  })

  it('rejects browser identity fields and forwards the restore command', async () => {
    const restore = vi.fn().mockResolvedValue({
      costEntryId: ENTRY_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      costSource: 'manual',
      status: 'restored',
      restoredAt: '2026-08-07T00:00:00.000Z',
      restorable: false,
    })
    const app = await appFor(vi.fn(), restore)

    await request(app.getHttpServer())
      .post(`/v1/projects/${PROJECT_ID}/cost-entries/${ENTRY_ID}/restore`)
      .set('Idempotency-Key', 'cost-restore-1')
      .send({ reason: ' Corrected source entry ', tenantId: TENANT_ID })
      .expect(400)
    expect(restore).not.toHaveBeenCalled()

    await request(app.getHttpServer())
      .post(`/v1/projects/${PROJECT_ID}/cost-entries/${ENTRY_ID}/restore`)
      .set('Idempotency-Key', 'cost-restore-1')
      .send({ reason: ' Corrected source entry ' })
      .expect(200)

    expect(restore).toHaveBeenCalledWith(
      PROJECT_ID,
      ENTRY_ID,
      'Corrected source entry',
      expect.objectContaining({ tenantId: TENANT_ID, role: 'pm' }),
      'cost-restore-1'
    )
  })
})
