import 'reflect-metadata'

import { describe, expect, it, vi } from 'vitest'

import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DocumentUploadReservationController } from './document-upload-reservation.controller'
import {
  DocumentUploadReservationMutationPipe,
  DocumentUploadReservationPipe,
} from './document-upload-reservation.pipe'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444'

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'pm',
  email: 'pm@example.test',
}

const COMMAND = {
  projectId: PROJECT_ID,
  fileName: 'issued drawing.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1_024,
  description: 'Issued for construction',
}

function result(replayed: boolean) {
  return {
    reservationId: RESERVATION_ID,
    projectId: PROJECT_ID,
    storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-issued_drawing.pdf`,
    originalFileName: COMMAND.fileName,
    declaredSizeBytes: COMMAND.sizeBytes,
    declaredContentType: COMMAND.mimeType,
    expiresAt: '2026-08-24T04:00:00.000Z',
    signedUrl: 'https://storage.example.test/signed-upload',
    token: 'bounded-secret-token',
    state: 'active' as const,
    replayed,
  }
}

describe('document upload reservation controller contract', () => {
  it('rejects a missing or oversized idempotency key before service invocation', async () => {
    const service = { reserve: vi.fn() }
    const controller = new DocumentUploadReservationController(service as never)
    const request = new DocumentUploadReservationPipe().transform(COMMAND)

    await expect(
      controller.reserve(request, undefined, PRINCIPAL, {
        status: vi.fn(),
      } as never)
    ).rejects.toThrow('Invalid Idempotency-Key header')
    await expect(
      controller.reserve(request, 'x'.repeat(257), PRINCIPAL, {
        status: vi.fn(),
      } as never)
    ).rejects.toThrow('Invalid Idempotency-Key header')
    expect(service.reserve).not.toHaveBeenCalled()
  })

  it('rejects caller-supplied authority and storage fields', () => {
    const pipe = new DocumentUploadReservationPipe()

    expect(() =>
      pipe.transform({
        ...COMMAND,
        tenantId: TENANT_ID,
        actorId: USER_ID,
        storagePath: `${TENANT_ID}/caller-selected`,
      })
    ).toThrow('Invalid document upload reservation command')
  })

  it('returns 201 for a new reservation and 200 for an exact replay', async () => {
    const service = {
      reserve: vi
        .fn()
        .mockResolvedValueOnce(result(false))
        .mockResolvedValueOnce(result(true)),
    }
    const controller = new DocumentUploadReservationController(service as never)
    const request = new DocumentUploadReservationPipe().transform(COMMAND)
    const status = vi.fn()

    await expect(
      controller.reserve(request, ' reservation-1 ', PRINCIPAL, {
        status,
      } as never)
    ).resolves.toMatchObject({ replayed: false })
    await expect(
      controller.reserve(request, 'reservation-1', PRINCIPAL, {
        status,
      } as never)
    ).resolves.toMatchObject({ replayed: true })

    expect(status).toHaveBeenNthCalledWith(1, 201)
    expect(status).toHaveBeenNthCalledWith(2, 200)
    expect(service.reserve).toHaveBeenNthCalledWith(
      1,
      request,
      PRINCIPAL,
      'reservation-1'
    )
  })

  it('accepts only empty lifecycle bodies and forwards verified authority', async () => {
    const service = {
      reserve: vi.fn(),
      complete: vi.fn().mockResolvedValue({ state: 'completed' }),
      release: vi.fn().mockResolvedValue({ state: 'released' }),
    }
    const controller = new DocumentUploadReservationController(service as never)
    const mutationBody = new DocumentUploadReservationMutationPipe().transform(
      undefined
    )

    await expect(
      controller.complete(RESERVATION_ID, mutationBody, PRINCIPAL)
    ).resolves.toMatchObject({ state: 'completed' })
    await expect(
      controller.release(RESERVATION_ID, mutationBody, PRINCIPAL)
    ).resolves.toMatchObject({ state: 'released' })
    expect(service.complete).toHaveBeenCalledWith(RESERVATION_ID, PRINCIPAL)
    expect(service.release).toHaveBeenCalledWith(RESERVATION_ID, PRINCIPAL)
    expect(mutationBody).toEqual({})
    expect(() =>
      new DocumentUploadReservationMutationPipe().transform({
        tenantId: TENANT_ID,
      })
    ).toThrow('Invalid document upload reservation mutation body')
  })
})
