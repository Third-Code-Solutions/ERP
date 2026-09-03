import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseService } from '../database/database.service'
import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import { DocumentIntakeController } from './document-intake.controller'
import { DocumentIntakeService } from './document-intake.service'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_A = '22222222-2222-4222-8222-222222222222'
const TENANT_B = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'

function databaseWithMembership(
  membership:
    | { tenantId: string; role: string; email: string; accountStatus?: string; tenantStatus?: string }
    | undefined
): DatabaseService {
  const limit = vi.fn().mockResolvedValue(
    membership
      ? [{ accountStatus: 'active', tenantStatus: 'active', ...membership }]
      : []
  )
  const where = vi.fn().mockReturnValue({ limit })
  const innerJoin = vi.fn().mockReturnValue({ where })
  const from = vi.fn().mockReturnValue({ innerJoin })
  const select = vi.fn().mockReturnValue({ from })
  return { client: { select } } as unknown as DatabaseService
}

describe('Document intake protected boundary', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(
    membership:
      | { tenantId: string; role: string; email: string }
      | undefined,
    create = vi.fn().mockResolvedValue({
      documentId: '55555555-5555-4555-8555-555555555555',
      tenantId: TENANT_B,
      projectId: PROJECT_ID,
      storagePath: `${TENANT_B}/${PROJECT_ID}/drawing.pdf`,
      documentType: 'pdf',
      status: 'created',
      created: true,
    })
  ) {
    const identity = {
      verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }),
    } as unknown as SupabaseIdentityService
    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentIntakeController],
      providers: [{ provide: DocumentIntakeService, useValue: { create } }],
    }).compile()
    const app = moduleRef.createNestApplication()
    const reflector = new Reflector()
    app.useGlobalGuards(
      new SupabaseJwtGuard(
        identity,
        reflector,
        databaseWithMembership(membership)
      ),
      new CapabilityGuard(reflector)
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
    return { app, identity, create }
  }

  it('rejects missing bearer before service invocation', async () => {
    const harness = await appFor({
      tenantId: TENANT_B,
      role: 'pm',
      email: 'pm@example.test',
    })
    await request(harness.app.getHttpServer())
      .post('/v1/documents')
      .set('Idempotency-Key', 'intake-1')
      .send({
        storagePath: `${TENANT_B}/${PROJECT_ID}/drawing.pdf`,
        projectId: PROJECT_ID,
        fileName: 'drawing.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      })
      .expect(401)
    expect(harness.identity.verifyAccessToken).not.toHaveBeenCalled()
    expect(harness.create).not.toHaveBeenCalled()
  })

  it('uses verified membership scope and rejects caller-selected tenant data', async () => {
    const harness = await appFor({
      tenantId: TENANT_B,
      role: 'pm',
      email: 'pm@example.test',
    })
    const command = {
      storagePath: `${TENANT_B}/${PROJECT_ID}/drawing.pdf`,
      projectId: PROJECT_ID,
      fileName: 'drawing.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
    }

    await request(harness.app.getHttpServer())
      .post('/v1/documents')
      .set('Authorization', 'Bearer verified-token')
      .set('Idempotency-Key', 'intake-1')
      .send(command)
      .expect(201)
    expect(harness.create).toHaveBeenCalledWith(
      command,
      expect.objectContaining({ userId: USER_ID, tenantId: TENANT_B, role: 'pm' }),
      'intake-1'
    )

    await request(harness.app.getHttpServer())
      .post('/v1/documents')
      .set('Authorization', 'Bearer verified-token')
      .set('Idempotency-Key', 'intake-2')
      .send({ ...command, tenantId: TENANT_A, uploadedBy: USER_ID })
      .expect(400)
    expect(harness.create).toHaveBeenCalledTimes(1)
  })

  it('rejects a token without ERP membership', async () => {
    const harness = await appFor(undefined)
    await request(harness.app.getHttpServer())
      .post('/v1/documents')
      .set('Authorization', 'Bearer verified-token')
      .set('Idempotency-Key', 'intake-1')
      .send({
        storagePath: `${TENANT_B}/${PROJECT_ID}/drawing.pdf`,
        projectId: PROJECT_ID,
        fileName: 'drawing.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      })
      .expect(401)
    expect(harness.create).not.toHaveBeenCalled()
  })
})
