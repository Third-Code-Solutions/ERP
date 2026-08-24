import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CapabilityGuard } from '../auth/capability.guard'
import { SupabaseJwtGuard } from '../auth/supabase-jwt.guard'
import type { SupabaseIdentityService } from '../auth/supabase-identity.service'
import type { DatabaseService } from '../database/database.service'
import { DocumentUploadReservationController } from './document-upload-reservation.controller'
import { DocumentUploadReservationService } from './document-upload-reservation.service'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_A = '22222222-2222-4222-8222-222222222222'
const TENANT_B = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const RESERVATION_ID = '55555555-5555-4555-8555-555555555555'

function databaseWithMembership(
  membership:
    | { tenantId: string; role: string; email: string }
    | undefined
): DatabaseService {
  const limit = vi.fn().mockResolvedValue(membership ? [membership] : [])
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })
  return { client: { select } } as unknown as DatabaseService
}

describe('Document upload reservation protected boundary', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  async function appFor(
    membership:
      | { tenantId: string; role: string; email: string }
      | undefined,
    reserve = vi.fn().mockResolvedValue({
      reservationId: RESERVATION_ID,
      projectId: PROJECT_ID,
      storagePath: `${TENANT_B}/${PROJECT_ID}/${RESERVATION_ID}-drawing.pdf`,
      originalFileName: 'drawing.pdf',
      declaredSizeBytes: 10,
      declaredContentType: 'application/pdf',
      expiresAt: '2026-08-24T04:00:00.000Z',
      signedUrl: 'https://storage.example.test/signed-upload',
      token: 'bounded-secret-token',
      state: 'active',
      replayed: false,
    })
  ) {
    const identity = {
      verifyAccessToken: vi.fn().mockResolvedValue({ userId: USER_ID }),
    } as unknown as SupabaseIdentityService
    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentUploadReservationController],
      providers: [
        {
          provide: DocumentUploadReservationService,
          useValue: {
            reserve,
            complete: vi.fn().mockResolvedValue({ state: 'completed' }),
            release: vi.fn().mockResolvedValue({ state: 'released' }),
          },
        },
      ],
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
    return { app, identity, reserve }
  }

  it('rejects a missing bearer token before service invocation', async () => {
    const harness = await appFor({
      tenantId: TENANT_B,
      role: 'pm',
      email: 'pm@example.test',
    })

    await request(harness.app.getHttpServer())
      .post('/v1/document-upload-reservations')
      .set('Idempotency-Key', 'reservation-1')
      .send({
        projectId: PROJECT_ID,
        fileName: 'drawing.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      })
      .expect(401)

    expect(harness.identity.verifyAccessToken).not.toHaveBeenCalled()
    expect(harness.reserve).not.toHaveBeenCalled()
  })

  it('uses verified membership scope and rejects caller authority fields', async () => {
    const harness = await appFor({
      tenantId: TENANT_B,
      role: 'pm',
      email: 'pm@example.test',
    })
    const command = {
      projectId: PROJECT_ID,
      fileName: 'drawing.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
    }

    await request(harness.app.getHttpServer())
      .post('/v1/document-upload-reservations')
      .set('Authorization', 'Bearer verified-token')
      .set('Idempotency-Key', 'reservation-1')
      .send(command)
      .expect(201)
    expect(harness.reserve).toHaveBeenCalledWith(
      command,
      expect.objectContaining({
        userId: USER_ID,
        tenantId: TENANT_B,
        role: 'pm',
      }),
      'reservation-1'
    )

    await request(harness.app.getHttpServer())
      .post('/v1/document-upload-reservations')
      .set('Authorization', 'Bearer verified-token')
      .set('Idempotency-Key', 'reservation-2')
      .send({ ...command, tenantId: TENANT_A, actorId: USER_ID })
      .expect(400)
    expect(harness.reserve).toHaveBeenCalledTimes(1)
  })

  it('rejects a verified token without ERP membership', async () => {
    const harness = await appFor(undefined)

    await request(harness.app.getHttpServer())
      .post('/v1/document-upload-reservations')
      .set('Authorization', 'Bearer verified-token')
      .set('Idempotency-Key', 'reservation-1')
      .send({
        projectId: PROJECT_ID,
        fileName: 'drawing.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      })
      .expect(401)
    expect(harness.reserve).not.toHaveBeenCalled()
  })

  it('rejects a verified member without document management capability', async () => {
    const harness = await appFor({
      tenantId: TENANT_B,
      role: 'viewer',
      email: 'viewer@example.test',
    })

    await request(harness.app.getHttpServer())
      .post('/v1/document-upload-reservations')
      .set('Authorization', 'Bearer verified-token')
      .set('Idempotency-Key', 'reservation-1')
      .send({
        projectId: PROJECT_ID,
        fileName: 'drawing.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      })
      .expect(403)
    expect(harness.reserve).not.toHaveBeenCalled()
  })

  it('accepts bodyless completion and release commands', async () => {
    const harness = await appFor({
      tenantId: TENANT_B,
      role: 'pm',
      email: 'pm@example.test',
    })

    await request(harness.app.getHttpServer())
      .post(
        `/v1/document-upload-reservations/${RESERVATION_ID}/complete`
      )
      .set('Authorization', 'Bearer verified-token')
      .expect(200)
    await request(harness.app.getHttpServer())
      .delete(`/v1/document-upload-reservations/${RESERVATION_ID}`)
      .set('Authorization', 'Bearer verified-token')
      .expect(200)
  })
})
