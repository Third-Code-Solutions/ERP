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
import { CadEvidenceCommitController } from './cad-evidence-commit.controller'
import { CadEvidenceCommitService } from './cad-evidence-commit.service'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_A = '22222222-2222-4222-8222-222222222222'
const TENANT_B = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'
const PROJECT_ID = '55555555-5555-4555-8555-555555555555'

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

const COMMAND = {
  projectId: PROJECT_ID,
  workerResponse: {
    document_id: DOCUMENT_ID,
    scope_items: [],
    count: 0,
    warnings: [],
    parsed_format: 'dxf' as const,
    source_format: 'dxf' as const,
  },
}

describe('CAD evidence protected boundary', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(
    membership:
      | { tenantId: string; role: string; email: string }
      | undefined,
    commit = vi.fn().mockResolvedValue({
      documentId: DOCUMENT_ID,
      projectId: PROJECT_ID,
      tenantId: TENANT_B,
      scopeItemsCreated: 0,
      sourceFormat: 'dxf',
      status: 'committed',
    })
  ) {
    const identity = {
      verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }),
    } as unknown as SupabaseIdentityService
    const moduleRef = await Test.createTestingModule({
      controllers: [CadEvidenceCommitController],
      providers: [{ provide: CadEvidenceCommitService, useValue: { commit } }],
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
    return { app, identity, commit }
  }

  it('rejects missing bearer before identity or Core invocation', async () => {
    const harness = await appFor({
      tenantId: TENANT_B,
      role: 'pm',
      email: 'pm@example.test',
    })

    await request(harness.app.getHttpServer())
      .post(`/v1/documents/${DOCUMENT_ID}/cad-evidence`)
      .set('Idempotency-Key', 'cad-protected-1')
      .send(COMMAND)
      .expect(401)

    expect(harness.identity.verifyAccessToken).not.toHaveBeenCalled()
    expect(harness.commit).not.toHaveBeenCalled()
  })

  it('uses verified tenant membership and rejects caller authority fields', async () => {
    const harness = await appFor({
      tenantId: TENANT_B,
      role: 'pm',
      email: 'pm@example.test',
    })

    await request(harness.app.getHttpServer())
      .post(`/v1/documents/${DOCUMENT_ID}/cad-evidence`)
      .set('Authorization', 'Bearer verified-token')
      .set('Idempotency-Key', ' cad-protected-2 ')
      .send(COMMAND)
      .expect(200)

    expect(harness.commit).toHaveBeenCalledWith(
      DOCUMENT_ID,
      COMMAND,
      expect.objectContaining({
        userId: USER_ID,
        tenantId: TENANT_B,
        role: 'pm',
      }),
      'cad-protected-2'
    )

    await request(harness.app.getHttpServer())
      .post(`/v1/documents/${DOCUMENT_ID}/cad-evidence`)
      .set('Authorization', 'Bearer verified-token')
      .set('Idempotency-Key', 'cad-protected-3')
      .send({ ...COMMAND, tenantId: TENANT_A, actorId: USER_ID })
      .expect(400)

    expect(harness.commit).toHaveBeenCalledTimes(1)
  })

  it('denies a role without document.manage before Core invocation', async () => {
    const harness = await appFor({
      tenantId: TENANT_B,
      role: 'viewer',
      email: 'viewer@example.test',
    })

    await request(harness.app.getHttpServer())
      .post(`/v1/documents/${DOCUMENT_ID}/cad-evidence`)
      .set('Authorization', 'Bearer verified-token')
      .set('Idempotency-Key', 'cad-protected-4')
      .send(COMMAND)
      .expect(403)

    expect(harness.commit).not.toHaveBeenCalled()
  })

  it('rejects a verified token without ERP membership', async () => {
    const harness = await appFor(undefined)

    await request(harness.app.getHttpServer())
      .post(`/v1/documents/${DOCUMENT_ID}/cad-evidence`)
      .set('Authorization', 'Bearer verified-token')
      .set('Idempotency-Key', 'cad-protected-5')
      .send(COMMAND)
      .expect(401)

    expect(harness.commit).not.toHaveBeenCalled()
  })
})
