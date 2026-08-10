import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const NOTIFICATION_ID = '33333333-3333-4333-8333-333333333333'

describe('Notifications HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(service = { list: vi.fn(), markReadState: vi.fn() }) {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: service }],
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
    return { app, service }
  }

  it('returns the user-scoped list through the service', async () => {
    const service = {
      list: vi.fn().mockResolvedValue({ items: [], unread: 0 }),
      markReadState: vi.fn(),
    }
    const probe = await appFor(service)

    await request(probe.app.getHttpServer())
      .get('/v1/notifications')
      .expect(200, { items: [], unread: 0 })
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, role: 'pm' })
    )
  })

  it('rejects malformed commands and forwards valid read-state updates', async () => {
    const service = {
      list: vi.fn(),
      markReadState: vi.fn().mockResolvedValue({ ok: true }),
    }
    const probe = await appFor(service)

    await request(probe.app.getHttpServer())
      .post('/v1/notifications')
      .send({ action: 'mark_read' })
      .expect(400)
    expect(service.markReadState).not.toHaveBeenCalled()

    await request(probe.app.getHttpServer())
      .post('/v1/notifications')
      .send({ action: 'mark_read', id: NOTIFICATION_ID })
      .expect(200, { ok: true })
    expect(service.markReadState).toHaveBeenCalledWith(
      { action: 'mark_read', id: NOTIFICATION_ID },
      expect.objectContaining({ tenantId: TENANT_ID })
    )
  })
})
