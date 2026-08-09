import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'
import { CreateProjectCommentPipe } from './project-comment.pipe'
import { ProjectCommentCreationService } from './project-comment-creation.service'
import { ProjectCommentDeletionService } from './project-comment-deletion.service'
import { ProjectCommentsController } from './project-comments.controller'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const COMMENT_ID = '44444444-4444-4444-8444-444444444444'

describe('Project comment creation HTTP contract', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(create = vi.fn(), remove = vi.fn()) {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectCommentsController],
      providers: [
        CreateProjectCommentPipe,
        { provide: ProjectCommentCreationService, useValue: { create } },
        { provide: ProjectCommentDeletionService, useValue: { delete: remove } },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: USER_ID,
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

  it('requires an idempotency key before reaching Core', async () => {
    const create = vi.fn()
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post(`/v1/projects/${PROJECT_ID}/comments`)
      .send({ projectId: PROJECT_ID, body: 'Delivery is ready.' })
      .expect(400)

    expect(create).not.toHaveBeenCalled()
  })

  it('rejects a body project id that does not match the route', async () => {
    const create = vi.fn()
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post(`/v1/projects/${PROJECT_ID}/comments`)
      .set('Idempotency-Key', 'comment-contract-1')
      .send({
        projectId: '55555555-5555-4555-8555-555555555555',
        body: 'Delivery is ready.',
      })
      .expect(400)

    expect(create).not.toHaveBeenCalled()
  })

  it('forwards the normalized command, principal, and idempotency key', async () => {
    const create = vi.fn().mockResolvedValue({
      commentId: COMMENT_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      authorId: USER_ID,
      body: 'Delivery is ready.',
      mentions: [],
      created: true,
    })
    const app = await appFor(create)

    await request(app.getHttpServer())
      .post(`/v1/projects/${PROJECT_ID}/comments`)
      .set('Idempotency-Key', 'comment-contract-2')
      .send({ projectId: PROJECT_ID, body: '  Delivery is ready.  ' })
      .expect(201)

    expect(create).toHaveBeenCalledWith(
      {
        projectId: PROJECT_ID,
        body: 'Delivery is ready.',
      },
      expect.objectContaining({ userId: USER_ID, tenantId: TENANT_ID }),
      'comment-contract-2'
    )
  })

  it('requires an idempotency key for deletion before reaching Core', async () => {
    const remove = vi.fn()
    const app = await appFor(vi.fn(), remove)

    await request(app.getHttpServer())
      .delete(`/v1/projects/${PROJECT_ID}/comments/${COMMENT_ID}`)
      .expect(400)

    expect(remove).not.toHaveBeenCalled()
  })

  it('forwards the scoped deletion command, principal, and key', async () => {
    const remove = vi.fn().mockResolvedValue({
      commentId: COMMENT_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      deleted: true,
    })
    const app = await appFor(vi.fn(), remove)

    await request(app.getHttpServer())
      .delete(`/v1/projects/${PROJECT_ID}/comments/${COMMENT_ID}`)
      .set('Idempotency-Key', 'comment-delete-contract-1')
      .expect(200)

    expect(remove).toHaveBeenCalledWith(
      { projectId: PROJECT_ID, commentId: COMMENT_ID },
      expect.objectContaining({ userId: USER_ID, tenantId: TENANT_ID }),
      'comment-delete-contract-1'
    )
  })
})
