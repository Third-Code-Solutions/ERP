import 'reflect-metadata'

import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { UserRoleAssignmentController } from './user-role-assignment.controller'
import { UserRoleAssignmentService } from './user-role-assignment.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'

describe('User role assignment HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(assign = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [UserRoleAssignmentController],
      providers: [
        {
          provide: UserRoleAssignmentService,
          useValue: { assign },
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: '11111111-1111-4111-8111-111111111111',
        tenantId: TENANT_ID,
        role: 'admin',
        email: 'admin@example.test',
      }
      next()
    })
    await app.init()
    close = () => app.close()
    return app
  }

  it('requires an idempotency key', async () => {
    const assign = vi.fn()
    const app = await appFor(assign)

    await request(app.getHttpServer())
      .patch(`/v1/admin/users/${USER_ID}/role`)
      .send({ expectedRole: 'viewer', role: 'pm' })
      .expect(400)

    expect(assign).not.toHaveBeenCalled()
  })

  it('rejects browser-owned tenant fields', async () => {
    const assign = vi.fn()
    const app = await appFor(assign)

    await request(app.getHttpServer())
      .patch(`/v1/admin/users/${USER_ID}/role`)
      .set('Idempotency-Key', 'role-1')
      .send({
        expectedRole: 'viewer',
        role: 'pm',
        tenantId: TENANT_ID,
      })
      .expect(400)

    expect(assign).not.toHaveBeenCalled()
  })

  it('forwards the validated command and verified principal', async () => {
    const assign = vi.fn().mockResolvedValue({
      userId: USER_ID,
      tenantId: TENANT_ID,
      previousRole: 'viewer',
      role: 'pm',
      status: 'updated',
      updatedAt: '2026-08-07T00:00:00.000Z',
    })
    const app = await appFor(assign)

    await request(app.getHttpServer())
      .patch(`/v1/admin/users/${USER_ID}/role`)
      .set('Idempotency-Key', 'role-1')
      .send({ expectedRole: 'viewer', role: 'pm' })
      .expect(200)

    expect(assign).toHaveBeenCalledWith(
      USER_ID,
      { expectedRole: 'viewer', role: 'pm' },
      expect.objectContaining({ tenantId: TENANT_ID, role: 'admin' }),
      'role-1'
    )
  })
})
